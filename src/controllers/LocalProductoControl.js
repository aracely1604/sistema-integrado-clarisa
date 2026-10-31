// controllers/LocalProductoControl.js
//
// Control (capa C del MVC) de los productos DENTRO de un local puntual:
// locales/{local}/productos/{idProducto}. Complementa a ProductoControl.js
// (nodo global, donde vive nombre/categoría/código/unidad): acá vive
// stock actual, stock mínimo, precio de venta y activo — todo POR LOCAL.
//
// El idProducto usado como id del documento es siempre el mismo id del
// producto en el nodo global, así ambos quedan enlazados 1 a 1.
//
// Este archivo también es responsable de historialStock (ver
// models/HistorialStockModel.js): cada movimiento de stock (reposición,
// transferencia, devolución) actualiza stockActual Y crea su registro de
// historial dentro de la MISMA transacción de Firestore, para que nunca
// quede uno sin el otro.

import {
  doc, getDoc, updateDoc, setDoc, query, onSnapshot,
  collection, runTransaction, serverTimestamp, where, orderBy, limit, getDocs, writeBatch,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import { productosColRef, modificacionesProductoColRef } from '../models/LocalModel';
import { LocalProductoModel } from '../models/LocalProductoModel';
import { HistorialStockModel, TIPOS_MOVIMIENTO_STOCK } from '../models/HistorialStockModel';
import { candidatoDeTransferencia } from './HistorialStockControl';

const HISTORIAL_STOCK_COLLECTION = 'historialStock';

function historialStockColRef() {
  return collection(db, HISTORIAL_STOCK_COLLECTION);
}

function esVacio(valor) {
  return valor === '' || valor === null || valor === undefined;
}

/** Acepta el objeto `usuario` completo (de useAuth()) o ya un uid en string. */
function extraerUsuarioId(usuario) {
  if (!usuario) return null;
  if (typeof usuario === 'string') return usuario;
  return usuario.uid ?? null;
}

// ─── Validación (producto por local: stock mínimo / precio de venta) ───────
function validarProductoLocal({ stockMinimo, precioVenta, oferta }) {
  const errores = {};

  const minimo = Number(stockMinimo);
  if (esVacio(stockMinimo) || Number.isNaN(minimo) || minimo < 0) {
    errores.stockMinimo = 'Ingresa un stock mínimo válido';
  }

  const precio = Number(precioVenta);
  if (esVacio(precioVenta) || Number.isNaN(precio) || precio <= 0) {
    errores.precioVenta = 'Ingresa un precio de venta válido';
  }

  // El precio de oferta es opcional: 0 = sin oferta definida
  if (!esVacio(oferta)) {
    const precioOferta = Number(oferta);
    if (Number.isNaN(precioOferta) || precioOferta < 0) {
      errores.oferta = 'Ingresa un precio de oferta válido';
    }
  }

  if (Object.keys(errores).length > 0) {
    const err = new Error('Datos de producto de local inválidos');
    err.errores = errores;
    throw err;
  }
}

// ─── Ver si un producto (global) ya está registrado en este local ──────────
export async function obtenerProductoLocal(local, idProducto) {
  if (!idProducto) return null;
  const ref = doc(productosColRef(local), idProducto);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return LocalProductoModel.fromFirebase(snap.id, snap.data());
}

// ─── Registrar un producto global dentro de este local ──────────────────────
// stockActual siempre arranca en 0; stockMinimo y precioVenta vienen del form.
// (Esto NO es un "movimiento de stock" — no genera historialStock.)
export async function crearProductoEnLocal(local, idProducto, form) {
  if (!idProducto) {
    const err = new Error('Falta seleccionar un producto del catálogo global');
    err.errores = { general: 'Selecciona o verifica un producto antes de guardar' };
    throw err;
  }

  validarProductoLocal(form);

  const existente = await obtenerProductoLocal(local, idProducto);
  if (existente) {
    const err = new Error('Este producto ya está registrado en este local');
    err.errores = { general: 'Este producto ya está registrado en este local' };
    throw err;
  }

  const producto = new LocalProductoModel({
    idProducto,
    stockActual: 0,
    stockMinimo: form.stockMinimo,
    precioVenta: form.precioVenta,
    activo: true,
    usoReceta: Boolean(form.usoReceta),
  });

  const ref = doc(productosColRef(local), idProducto);
  await setDoc(ref, producto.toFirebase());
  return producto;
}

// ─── Actualizar stock mínimo / precio de venta / precio de oferta de un producto ───
// Además de actualizar el producto, deja registro del cambio en la subcolección
//   locales/{local}/productos/{idProducto}/modificaciones/{id}
// dentro de la MISMA transacción (o se guardan ambos, o ninguno). Cada documento
// guarda UNA modificación con la lista de lo que cambió:
//   { fecha, usuario, cambios: [{ campo, anterior, nuevo }, ...] }
// "anterior" se lee del documento real dentro de la transacción (no de lo que la
// pantalla creía), y si no cambió ningún valor no se escribe nada en el historial.
// Los valores van en unidad BASE (g/ml/uds), igual que stockMinimo en el producto.
// `cambios.oferta` es opcional (si no viene, se conserva la oferta actual). El precio
// de oferta, si es > 0, debe ser menor al precio de venta; si se deja en 0 y la oferta
// estaba activa, se desactiva sola (una oferta activa sin precio no tiene sentido).
export async function actualizarProductoLocal(local, idProducto, cambios, opciones = {}) {
  validarProductoLocal(cambios);
  const { usuario = null } = opciones;

  const ref = doc(productosColRef(local), idProducto);
  const nuevoMinimo = Number(cambios.stockMinimo);
  const nuevoPrecio = Number(cambios.precioVenta);
  const usuarioId = extraerUsuarioId(usuario);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      const err = new Error('El producto no está registrado en este local');
      err.errores = { general: 'El producto no está registrado en este local' };
      throw err;
    }

    const actual = snap.data();
    const minimoAnterior = Number(actual.stockMinimo) || 0;
    const precioAnterior = Number(actual.precioVenta) || 0;
    const ofertaAnterior = Number(actual.oferta) || 0;
    const nuevaOferta = esVacio(cambios.oferta) ? ofertaAnterior : Number(cambios.oferta);

    if (nuevaOferta > 0 && nuevaOferta >= nuevoPrecio) {
      const err = new Error('El precio de oferta debe ser menor al precio de venta');
      err.errores = { oferta: 'El precio de oferta debe ser menor al precio de venta' };
      throw err;
    }

    const lista = [];
    if (minimoAnterior !== nuevoMinimo) {
      lista.push({ campo: 'stockMinimo', anterior: minimoAnterior, nuevo: nuevoMinimo });
    }
    if (precioAnterior !== nuevoPrecio) {
      lista.push({ campo: 'precioVenta', anterior: precioAnterior, nuevo: nuevoPrecio });
    }
    if (ofertaAnterior !== nuevaOferta) {
      lista.push({ campo: 'oferta', anterior: ofertaAnterior, nuevo: nuevaOferta });
    }

    const datosActualizados = {
      stockMinimo:   nuevoMinimo,
      precioVenta:   nuevoPrecio,
      oferta:        nuevaOferta,
      actualizadoEn: new Date().toISOString(),
    };
    if (nuevaOferta === 0 && actual.ofertaActiva) datosActualizados.ofertaActiva = false;
    tx.update(ref, datosActualizados);

    if (lista.length > 0) {
      tx.set(doc(modificacionesProductoColRef(local, idProducto)), {
        fecha: serverTimestamp(),
        usuario: usuarioId,
        cambios: lista,
      });
    }
  });
}

// ─── Completar oferta / ofertaActiva en productos que ya existían ───────────
// Los productos creados desde ahora ya nacen con oferta: 0 y ofertaActiva: false.
// Los anteriores no tienen esos campos en Firestore (en la app se leen con esos
// mismos valores por defecto). Llamar una sola vez por local si quieres que
// queden escritos en la base. Devuelve cuántos productos se completaron.
export async function completarCamposOfertaEnLocal(local) {
  const snap = await getDocs(productosColRef(local));
  const pendientes = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    const faltan = {};
    if (data.oferta === undefined) faltan.oferta = 0;
    if (data.ofertaActiva === undefined) faltan.ofertaActiva = false;
    if (Object.keys(faltan).length > 0) pendientes.push({ ref: d.ref, faltan });
  });

  // Un batch admite máx. 500 escrituras
  for (let i = 0; i < pendientes.length; i += 400) {
    const batch = writeBatch(db);
    pendientes.slice(i, i + 400).forEach(({ ref, faltan }) => batch.update(ref, faltan));
    await batch.commit();
  }
  return pendientes.length;
}

// ─── Ajustar stock actual "a mano" (sin historial) ──────────────────────────
// Se deja disponible como utilidad de bajo nivel, pero los movimientos reales
// (reposición/transferencia/devolución) ya NO pasan por acá — usan las
// funciones transaccionales de más abajo para que stock + historial queden
// siempre sincronizados.
export async function ajustarStockLocal(local, idProducto, nuevoStockActual) {
  const ref = doc(productosColRef(local), idProducto);
  await updateDoc(ref, {
    stockActual:   Number(nuevoStockActual) || 0,
    actualizadoEn: new Date().toISOString(),
  });
}

// ─── Activar / desactivar producto en este local ────────────────────────────
export async function cambiarEstadoProductoLocal(local, idProducto, activo) {
  const ref = doc(productosColRef(local), idProducto);
  await updateDoc(ref, { activo, actualizadoEn: new Date().toISOString() });
}

// ─── Activar / desactivar la oferta de un producto en este local ────────────
// Solo se puede activar si ya tiene un precio de oferta mayor a 0.
export async function cambiarOfertaActivaProductoLocal(local, idProducto, ofertaActiva) {
  const ref = doc(productosColRef(local), idProducto);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      const err = new Error('El producto no está registrado en este local');
      err.errores = { general: 'El producto no está registrado en este local' };
      throw err;
    }
    if (ofertaActiva && !(Number(snap.data().oferta) > 0)) {
      const err = new Error('Define un precio de oferta antes de activarla');
      err.errores = { general: 'Define un precio de oferta antes de activarla' };
      throw err;
    }
    tx.update(ref, { ofertaActiva: Boolean(ofertaActiva), actualizadoEn: new Date().toISOString() });
  });
}

// ─── Merma por vencimiento: dar de baja TODO el stock de un producto vencido ─
// En una sola transacción: deja stockActual en 0 y crea el historialStock de tipo
// 'merma' con: fecha (servidor), local, idProducto, cantidad (todo el stock, en
// unidad BASE como el resto de los movimientos), stockAnterior, stockNuevo (0),
// usuario (quien confirmó), valorUnitario (precio de venta del producto, por
// unidad/kg/lt), valorTotal (valorUnitario × cantidad) y fechaVencimiento.
//
// opciones:
//  - usuario:           objeto de useAuth() o uid. Si no viene, se toma el usuario
//                       autenticado de Firebase Auth.
//  - fechaVencimiento:  la del producto que se retira (queda en el historial).
//  - aUnidadPrecio:     (cantidadBase) => cantidad en la unidad en que está expresado
//                       el precio (kg, lt, uds). Sin esto se asume que ya coinciden.
//
// El stock y el precio se leen del documento real DENTRO de la transacción, no de lo
// que la pantalla tenía cargado.
export async function registrarMermaPorVencimiento(local, idProducto, opciones = {}) {
  const { usuario = null, fechaVencimiento = null, aUnidadPrecio = (cantidad) => cantidad } = opciones;

  const usuarioId = extraerUsuarioId(usuario) ?? getAuth().currentUser?.uid ?? null;
  if (!usuarioId) {
    const err = new Error('No hay un usuario autenticado');
    err.errores = { general: 'Debes iniciar sesión para registrar una merma' };
    throw err;
  }

  const ref = doc(productosColRef(local), idProducto);
  let resultado;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      const err = new Error('El producto no está registrado en este local');
      err.errores = { general: 'El producto no está registrado en este local' };
      throw err;
    }

    const datos = snap.data();
    const stockAnterior = Number(datos.stockActual) || 0;
    if (stockAnterior <= 0) {
      const err = new Error('El producto no tiene stock para dar de baja');
      err.errores = { general: 'El producto ya no tiene stock' };
      throw err;
    }

    const valorUnitario = Number(datos.precioVenta) || 0;
    const valorTotal = Math.round(valorUnitario * (Number(aUnidadPrecio(stockAnterior)) || 0) * 100) / 100;

    tx.update(ref, { stockActual: 0, actualizadoEn: new Date().toISOString() });

    const historial = new HistorialStockModel({
      fecha: serverTimestamp(),
      local,
      idProducto,
      tipoMovimiento: 'merma',
      cantidad: stockAnterior,
      stockAnterior,
      stockNuevo: 0,
      usuario: usuarioId,
      valorUnitario,
      valorTotal,
      fechaVencimiento: fechaVencimiento ?? null,
    });
    tx.set(doc(historialStockColRef()), historial.toFirebase());

    resultado = { stockAnterior, stockNuevo: 0, valorUnitario, valorTotal };
  });

  return resultado;
}

// ─── Suscripción en vivo a todos los productos de un local ─────────────────
export function suscribirProductosLocal(local, callback) {
  const q = query(productosColRef(local));
  const unsubscribe = onSnapshot(q, (snap) => {
    const productos = snap.docs.map((d) => LocalProductoModel.fromFirebase(d.id, d.data()));
    callback(productos);
  });
  return unsubscribe;
}

// ═══════════════════════════════════════════════════════════════════════════
// Movimientos de stock (Reposición / Transferencia / Devolución)
// Cada uno corre en una única transacción de Firestore: lee stockActual,
// calcula stockNuevo, escribe el/los producto(s) del local Y el/los
// documento(s) de historialStock — todo o nada.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Vencimiento vigente de un producto en un local ─────────────────────────
// Devuelve { fecha, vencimiento, orden } de la reposición más reciente de ese producto
// en ese local — o, si el stock llegó por transferencia, del vencimiento que esa
// transferencia traía (ver candidatoDeTransferencia en HistorialStockControl). Queda en
// null si no hay ninguna.
const milisDe = (f) => (f && typeof f.toMillis === 'function' ? f.toMillis() : 0);

async function obtenerUltimaReposicionConocida(local, idProducto) {
  // 2 lecturas de 1 documento (última reposición propia + última transferencia)
  // en vez de recorrer todo el historial del producto.
  // Índice compuesto: local Asc, idProducto Asc, tipoMovimiento Asc, fecha Desc.
  const ultimoDe = async (tipo) => {
    const snap = await getDocs(query(
      historialStockColRef(),
      where('local', '==', local),
      where('idProducto', '==', idProducto),
      where('tipoMovimiento', '==', tipo),
      orderBy('fecha', 'desc'),
      limit(1),
    ));
    return snap.docs[0]?.data() ?? null;
  };

  const [repo, transf] = await Promise.all([ultimoDe('reposicion'), ultimoDe('transferencia')]);

  const candidatos = [];
  if (repo?.fecha) {
    candidatos.push({ fecha: repo.fecha, vencimiento: repo.fechaVencimiento ?? null, orden: repo.fecha });
  }
  const deTransferencia = candidatoDeTransferencia(transf);
  if (deTransferencia) candidatos.push(deTransferencia);

  candidatos.sort((a, b) => milisDe(b.orden) - milisDe(a.orden));
  return candidatos[0] ?? null;
}

// { fecha, dias } del vencimiento vigente (dias < 0 = ya venció, 0 = vence hoy); null si no hay fecha.
function vencimientoDe(ultimaReposicion) {
  const fecha = parsearFechaVencimiento(ultimaReposicion?.vencimiento);
  if (!fecha) return null;
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return { fecha, dias: Math.round((fecha.getTime() - hoy.getTime()) / 86400000) };
}

// Si el vencimiento vigente ya pasó devuelve su Date; si no (o no hay fecha), null.
function fechaVencidaDe(ultimaReposicion) {
  const v = vencimientoDe(ultimaReposicion);
  return v && v.dias < 0 ? v.fecha : null;
}

const COMO_ELIMINAR_VENCIDO = 'Elimina ese stock vencido primero (Inventario → Por vencer → Eliminar stock vencido).';

// Crea el error que ve el formulario (en `errores[campo]`).
function errorVencido(mensaje, campo = 'general') {
  const err = new Error('Producto vencido con stock: movimiento bloqueado');
  err.errores = { [campo]: mensaje };
  return err;
}

// ─── Transferir stock de un producto entre dos locales ──────────────────────
// Genera DOS registros de historial (salida en origen, entrada en destino),
// con el mismo valorUnitario/valorTotal en ambos para trazar el costo.
// El producto DEBE estar ya registrado en el local de destino — si no lo
// está, la transferencia se rechaza por completo (no se crea automáticamente).
export async function transferirProductoEntreLocales(idProducto, localOrigen, localDestino, cantidad, opciones = {}) {
  const { usuario = null, valorUnitario = null } = opciones;

  const cant = Number(cantidad);
  if (!cant || cant <= 0) {
    const err = new Error('Cantidad de transferencia inválida');
    err.errores = { general: 'Ingresa una cantidad válida' };
    throw err;
  }
  if (localOrigen === localDestino) {
    const err = new Error('El local de destino debe ser distinto al de origen');
    err.errores = { general: 'Selecciona un local de destino distinto' };
    throw err;
  }

  const origenRef = doc(productosColRef(localOrigen), idProducto);
  const destinoRef = doc(productosColRef(localDestino), idProducto);
  const usuarioId = extraerUsuarioId(usuario);
  const valorTotal = esVacio(valorUnitario) ? null : Number(valorUnitario) * cant;

  // Vencimiento vigente de cada local (origen y destino). Sirve para (1) bloquear si
  // alguno de los dos tiene stock vencido y (2) decidir qué vencimiento queda en el destino.
  const [ultimaOrigen, ultimaDestino] = await Promise.all([
    obtenerUltimaReposicionConocida(localOrigen, idProducto),
    obtenerUltimaReposicionConocida(localDestino, idProducto),
  ]);

  await runTransaction(db, async (tx) => {
    // ── Lecturas primero (regla de las transacciones de Firestore) ──
    const origenSnap = await tx.get(origenRef);
    if (!origenSnap.exists()) {
      const err = new Error('El producto no está registrado en el local de origen');
      err.errores = { general: 'El producto no está registrado en el local de origen' };
      throw err;
    }
    const datosOrigen = origenSnap.data();
    const stockAnteriorOrigen = Number(datosOrigen.stockActual) || 0;
    if (stockAnteriorOrigen < cant) {
      const err = new Error('Stock insuficiente para transferir');
      err.errores = { general: 'Stock insuficiente para la transferencia' };
      throw err;
    }

    const destinoSnap = await tx.get(destinoRef);
    if (!destinoSnap.exists()) {
      const err = new Error('El producto no está registrado en el local de destino');
      err.errores = { localDestino: 'El producto no está registrado en el local de destino. Regístralo ahí primero.' };
      throw err;
    }
    const stockAnteriorDestino = Number(destinoSnap.data().stockActual) || 0;

    // ── Bloqueo por stock vencido ──
    // Origen: aquí siempre hay stock (se validó arriba), así que basta con que esté vencido.
    const vencidoOrigen = fechaVencidaDe(ultimaOrigen);
    if (vencidoOrigen) {
      throw errorVencido(
        `No se puede transferir: el producto está vencido en este local (venció el ${formatearFechaDMY(vencidoOrigen)}) y todavía tiene stock. ${COMO_ELIMINAR_VENCIDO}`,
      );
    }
    // Destino: solo molesta si tiene stock vencido. Con stock 0 se puede transferir
    // aunque su vencimiento viejo haya pasado (se reemplaza por el del origen, abajo).
    const vencidoDestino = stockAnteriorDestino > 0 ? fechaVencidaDe(ultimaDestino) : null;
    if (vencidoDestino) {
      throw errorVencido(
        `No se puede transferir: en el local de destino este producto está vencido (venció el ${formatearFechaDMY(vencidoDestino)}) y todavía tiene stock. Debe eliminarse allá antes de recibir más.`,
        'localDestino',
      );
    }

    // ── Vencimiento que queda en el destino ──
    // Destino sin stock → el vencimiento del ORIGEN (el viejo ya no corresponde a nada).
    // Destino con stock → se mantiene la regla de siempre: gana la reposición más reciente.
    const vigenteDestino = stockAnteriorDestino === 0 || !ultimaDestino
      ? ultimaOrigen
      : (milisDe(ultimaDestino.orden) > milisDe(ultimaOrigen?.orden) ? ultimaDestino : ultimaOrigen);

    // Cada movimiento queda como una "foto" del vencimiento vigente de SU local
    // (vencimientoVigente: true) — ver candidatoDeTransferencia.
    const camposSalida = {
      ultimaReposicionFecha: ultimaOrigen?.fecha ?? null,
      ultimaReposicionVencimiento: ultimaOrigen?.vencimiento ?? null,
      vencimientoVigente: true,
    };
    const camposEntrada = {
      ultimaReposicionFecha: vigenteDestino?.fecha ?? null,
      ultimaReposicionVencimiento: vigenteDestino?.vencimiento ?? null,
      vencimientoVigente: true,
    };

    const stockNuevoOrigen = stockAnteriorOrigen - cant;
    const stockNuevoDestino = stockAnteriorDestino + cant;
    const ahora = new Date().toISOString();

    // ── Escrituras: stock en ambos locales ──
    tx.update(origenRef, { stockActual: stockNuevoOrigen, actualizadoEn: ahora });
    tx.update(destinoRef, { stockActual: stockNuevoDestino, actualizadoEn: ahora });

    // ── Escrituras: los dos movimientos de historial ──
    const histSalida = new HistorialStockModel({
      fecha: serverTimestamp(),
      local: localOrigen,
      idProducto,
      tipoMovimiento: 'transferencia',
      cantidad: cant,
      stockAnterior: stockAnteriorOrigen,
      stockNuevo: stockNuevoOrigen,
      usuario: usuarioId,
      localRelacionado: localDestino,
      valorUnitario,
      valorTotal,
    });
    tx.set(doc(historialStockColRef()), { ...histSalida.toFirebase(), ...camposSalida });

    const histEntrada = new HistorialStockModel({
      fecha: serverTimestamp(),
      local: localDestino,
      idProducto,
      tipoMovimiento: 'transferencia',
      cantidad: cant,
      stockAnterior: stockAnteriorDestino,
      stockNuevo: stockNuevoDestino,
      usuario: usuarioId,
      localRelacionado: localOrigen,
      valorUnitario,
      valorTotal,
    });
    tx.set(doc(historialStockColRef()), { ...histEntrada.toFirebase(), ...camposEntrada });
  });
}

// ─── Reposición / Devolución: un solo local, siempre suman al stock ─────────
async function ejecutarMovimientoLocalConHistorial({
  local, idProducto, cantidad, tipoMovimiento, usuario, idProveedor, valorUnitario, fechaVencimiento,
}) {
  const ref = doc(productosColRef(local), idProducto);
  const usuarioId = extraerUsuarioId(usuario);
  const valorTotal = esVacio(valorUnitario) ? null : Number(valorUnitario) * cantidad;
  let resultado;

  // Para bloquear sobre stock vencido hace falta el vencimiento vigente del producto;
  // se lee antes de la transacción (reposición y devolución suman stock).
  const ultimaReposicion = await obtenerUltimaReposicionConocida(local, idProducto);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      const err = new Error('El producto no está registrado en este local');
      err.errores = { general: 'El producto no está registrado en este local' };
      throw err;
    }

    const stockAnterior = Number(snap.data().stockActual) || 0;

    const fechaVencida = fechaVencidaDe(ultimaReposicion);

    // Un producto vencido NO admite devoluciones, tenga o no stock.
    if (tipoMovimiento === 'devolucion' && fechaVencida) {
      throw errorVencido(
        `No es posible hacer una devolución de un producto vencido (venció el ${formatearFechaDMY(fechaVencida)}).`,
      );
    }

    // Un producto vencido con stock NO admite reposiciones: primero hay que dar de baja
    // ese stock (merma por vencimiento). Con stock en 0 sí se puede reponer.
    if (tipoMovimiento === 'reposicion' && stockAnterior > 0 && fechaVencida) {
      throw errorVencido(
        `No se puede reponer: el producto está vencido (venció el ${formatearFechaDMY(fechaVencida)}) y todavía tiene stock. ${COMO_ELIMINAR_VENCIDO}`,
      );
    }

    const stockNuevo = stockAnterior + cantidad; // reposición y devolución siempre suman

    tx.update(ref, { stockActual: stockNuevo, actualizadoEn: new Date().toISOString() });

    const historial = new HistorialStockModel({
      fecha: serverTimestamp(),
      local,
      idProducto,
      tipoMovimiento,
      cantidad,
      stockAnterior,
      stockNuevo,
      usuario: usuarioId,
      idProveedor: idProveedor ?? null,
      valorUnitario,
      valorTotal,
      fechaVencimiento: fechaVencimiento ?? null,
    });
    tx.set(doc(historialStockColRef()), historial.toFirebase());

    resultado = { stockAnterior, stockNuevo };
  });

  return resultado;
}

// ─── Fecha de vencimiento ───────────────────────────────────────────────────
// Se guarda SIEMPRE como "DD/MM/AAAA" (el formato que ya leen el resto de pantallas).
// Acepta "DD/MM/AAAA", "DD-MM-AAAA" y "AAAA-MM-DD" (lo que entrega un <input type="date">).
const MAX_ANIOS_VENCIMIENTO = 10;

function parsearFechaVencimiento(valor) {
  const texto = String(valor ?? '').trim();
  let m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);       // DD/MM/AAAA
  let dia, mes, anio;
  if (m) {
    [, dia, mes, anio] = m;
  } else if ((m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {  // AAAA-MM-DD
    [, anio, mes, dia] = m;
  } else {
    return null;
  }
  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
  // Rechaza fechas imposibles (31/02, 45/13...) que JS "corrige" solo.
  if (fecha.getDate() !== Number(dia) || fecha.getMonth() !== Number(mes) - 1) return null;
  return fecha;
}

function formatearFechaDMY(fecha) {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

// Devuelve el mensaje de error, o null si la fecha es aceptable para una reposición.
function validarFechaVencimientoReposicion(valor) {
  const fecha = parsearFechaVencimiento(valor);
  if (!fecha) return 'Fecha inválida. Elígela en el calendario (DD/MM/AAAA)';

  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (fecha < hoy) return 'La fecha de vencimiento no puede ser anterior a hoy';

  const limite = new Date(hoy.getFullYear() + MAX_ANIOS_VENCIMIENTO, hoy.getMonth(), hoy.getDate());
  if (fecha > limite) return `La fecha de vencimiento es demasiado lejana (máximo ${MAX_ANIOS_VENCIMIENTO} años)`;

  return null;
}

function validarMovimientoStock({ tipoMovimiento, cantidad, proveedorId, fechaVencimiento, localDestino, valorUnitario, local }) {
  const errores = {};

  if (!TIPOS_MOVIMIENTO_STOCK.includes(tipoMovimiento)) {
    errores.tipoMovimiento = 'Selecciona un tipo de movimiento válido';
  }

  const cant = Number(cantidad);
  if (esVacio(cantidad) || Number.isNaN(cant) || cant <= 0) {
    errores.cantidad = 'Ingresa una cantidad válida (mayor que 0)';
  }

  if (tipoMovimiento === 'reposicion') {
    if (!proveedorId) errores.proveedorId = 'Selecciona un proveedor';
    if (!fechaVencimiento) {
      errores.fechaVencimiento = 'La fecha de vencimiento es obligatoria';
    } else {
      const errorFecha = validarFechaVencimientoReposicion(fechaVencimiento);
      if (errorFecha) errores.fechaVencimiento = errorFecha;
    }
    if (esVacio(valorUnitario) || Number.isNaN(Number(valorUnitario)) || Number(valorUnitario) <= 0) {
      errores.valorUnitario = 'No se pudo calcular el costo unitario — revisa la cantidad y el costo total';
    }
  }

  if (tipoMovimiento === 'transferencia') {
    if (!localDestino) errores.localDestino = 'Selecciona un local de destino';
    else if (localDestino === local) errores.localDestino = 'El local de destino debe ser distinto al local actual';
    if (esVacio(valorUnitario) || Number.isNaN(Number(valorUnitario)) || Number(valorUnitario) <= 0) {
      errores.valorUnitario = 'No se pudo calcular el costo unitario — revisa la cantidad y el costo total';
    }
  }

  if (Object.keys(errores).length > 0) {
    const err = new Error('Datos de movimiento de stock inválidos');
    err.errores = errores;
    throw err;
  }
}

/**
 * Registra un movimiento de stock para un producto DENTRO de un local, y
 * crea automáticamente su registro en historialStock — ambas cosas dentro
 * de la misma transacción de Firestore (o dos transacciones, en el caso de
 * transferencia, una por cada... no: una sola transacción con ambos locales).
 *
 * El componente solo entrega lo que ya resolvió: idProducto (vía código de
 * barras → catálogo global), local (sesión/contexto) y usuario (objeto de
 * useAuth()) — acá NO se piden esos datos, se asumen ya resueltos.
 *
 * @param {object} datos
 * @param {string} datos.local
 * @param {string} datos.idProducto
 * @param {'reposicion'|'transferencia'|'devolucion'} datos.tipoMovimiento
 * @param {number|string} datos.cantidad
 * @param {string} [datos.proveedorId]      - obligatorio si tipoMovimiento === 'reposicion'
 * @param {string} [datos.fechaVencimiento] - obligatorio si tipoMovimiento === 'reposicion'
 * @param {string} [datos.localDestino]     - obligatorio si tipoMovimiento === 'transferencia'
 * @param {number|string} [datos.valorUnitario] - obligatorio en reposición y transferencia
 * @param {object} [datos.usuario]          - usuario autenticado (objeto de useAuth())
 * @returns {Promise<{stockAnterior: number, stockNuevo: number}|void>}
 */
export async function registrarMovimientoStock(datos) {
  const {
    local, idProducto, tipoMovimiento, cantidad,
    proveedorId, fechaVencimiento, localDestino, valorUnitario, usuario,
  } = datos;

  validarMovimientoStock(datos);

  const cant = Number(cantidad);

  if (tipoMovimiento === 'transferencia') {
    return transferirProductoEntreLocales(idProducto, local, localDestino, cant, { usuario, valorUnitario });
  }

  return ejecutarMovimientoLocalConHistorial({
    local,
    idProducto,
    cantidad: cant,
    tipoMovimiento,
    usuario,
    idProveedor: tipoMovimiento === 'reposicion' ? proveedorId : null,
    valorUnitario: tipoMovimiento === 'reposicion' ? valorUnitario : null,
    // Ya validada arriba; se guarda normalizada como DD/MM/AAAA.
    fechaVencimiento: tipoMovimiento === 'reposicion'
      ? formatearFechaDMY(parsearFechaVencimiento(fechaVencimiento))
      : null,
  });
}