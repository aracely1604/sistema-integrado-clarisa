import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import Perfil from './Perfil';
import { db } from '../firebase';
import { cerrarSesion } from '../models/authModel';
import { useAuth } from '../controllers/AuthContext';
import '../styles/views/delivery.css';

const estadosPedido = [
  { id: 'recibido', nombre: 'Recibido' },
  { id: 'en_camino', nombre: 'En camino' },
  { id: 'entregado', nombre: 'Entregado' },
];

const normalizarEstado = (estado) => String(estado || 'recibido')
  .trim()
  .toLowerCase()
  .replaceAll(' ', '_')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const obtenerIndiceEstado = (estado) => Math.max(0, estadosPedido.findIndex((item) => item.id === normalizarEstado(estado)));

const formatearFechaHora = (valor) => {
  if (!valor) return '-';
  const fecha = typeof valor.toDate === 'function' ? valor.toDate() : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '-' : fecha.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
};

const fechaPedido = (pedido) => {
  const valor = pedido.creadoEn || pedido.createdAt || pedido.fecha;
  const fecha = valor?.toDate?.() || new Date(valor || 0);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
};

function Delivery({ notify }) {
  const navigate = useNavigate();
  const { usuario: sesion } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [actualizandoId, setActualizandoId] = useState('');
  const [codigosFinales, setCodigosFinales] = useState({});

  useEffect(() => {
    // No se ordena desde Firestore: pedidos creados por el portal antiguo no
    // siempre tienen `creadoEn` y quedaban invisibles para el repartidor.
    const consulta = query(collection(db, 'pedidos'));
    const cancelarEscucha = onSnapshot(
      consulta,
      (resultado) => {
        const pedidosActualizados = resultado.docs
          .map((documento) => ({ id: documento.id, ...documento.data() }))
          .filter((pedido) => normalizarEstado(pedido.estado) !== 'entregado')
          .sort((a, b) => fechaPedido(b) - fechaPedido(a));
        setPedidos(pedidosActualizados);
      },
      (error) => {
        console.error('No se pudieron escuchar pedidos:', error);
        notify('No se pudieron cargar los pedidos de delivery.', 'error');
      },
    );

    return () => cancelarEscucha();
  }, [notify]);

  if (!sesion) {
    setTimeout(() => navigate('/login'), 0);
    return null;
  }

  const datosAutoCompletos = Boolean(sesion.patente && sesion.colorAuto && sesion.marcaAuto);

  const repartidorId = sesion.uid || sesion.user;
  const pedidoEnCurso = pedidos.find((pedido) => normalizarEstado(pedido.estado) === 'en_camino' && pedido.repartidorId === repartidorId);
  const pedidosVisibles = pedidoEnCurso
    ? [pedidoEnCurso]
    : pedidos.filter((pedido) => !pedido.repartidorId);

  const datosRepartidor = {
    repartidorId,
    repartidorNombre: [sesion.nombre, sesion.apellido].filter(Boolean).join(' ') || sesion.user,
    repartidorAuto: {
      patente: sesion.patente || '',
      color: sesion.colorAuto || '',
      marca: sesion.marcaAuto || '',
    },
  };

  const tomarPedido = async (pedido) => {
    setActualizandoId(pedido.id);
    try {
      if (pedidoEnCurso) {
        notify('Ya tienes un pedido en camino. Completa ese antes de tomar otro.', 'info');
        return;
      }

      await runTransaction(db, async (transaccion) => {
        const referencia = doc(db, 'pedidos', pedido.id);
        const captura = await transaccion.get(referencia);

        if (!captura.exists()) throw new Error('El pedido ya no existe.');

        const pedidoActual = captura.data();
        if (pedidoActual.repartidorId && pedidoActual.repartidorId !== repartidorId) {
          throw new Error('Otro repartidor ya tomó este pedido.');
        }

        transaccion.update(referencia, {
          estado: 'en_camino',
          actualizadoEn: serverTimestamp(),
          ...datosRepartidor,
        });
      });

      notify('Pedido tomado. El cliente verá que va en camino.', 'success');
    } catch (error) {
      console.error('No se pudo actualizar pedido:', error);
      notify(error.message || 'No se pudo tomar el pedido en Firebase.', 'error');
    } finally {
      setActualizandoId('');
    }
  };

  const completarPedido = async (pedido) => {
    const codigoIngresado = String(codigosFinales[pedido.id] || '').trim();

    if (codigoIngresado !== String(pedido.codigoFinal || '').trim()) {
      notify('El código final no coincide. Pídeselo al cliente y vuelve a intentar.', 'error');
      return;
    }

    setActualizandoId(pedido.id);
    try {
      await runTransaction(db, async (transaccion) => {
        const referencia = doc(db, 'pedidos', pedido.id);
        const captura = await transaccion.get(referencia);

        if (!captura.exists()) throw new Error('El pedido ya no existe.');

        const pedidoActual = captura.data();
        if (pedidoActual.repartidorId !== repartidorId) {
          throw new Error('Este pedido esta tomado por otro repartidor.');
        }

        transaccion.update(referencia, {
          estado: 'entregado',
          actualizadoEn: serverTimestamp(),
          entregadoEn: serverTimestamp(),
          ...datosRepartidor,
        });
      });

      setCodigosFinales((actuales) => ({ ...actuales, [pedido.id]: '' }));
      notify('Pedido completado con código final.', 'success');
    } catch (error) {
      console.error('No se pudo completar pedido:', error);
      notify(error.message || 'No se pudo completar el pedido.', 'error');
    } finally {
      setActualizandoId('');
    }
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">delivery</p>
          <h1>Panel de repartos</h1>
        </div>
        <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>
          Cerrar sesión
        </button>
      </header>

      <Perfil notify={notify} />

      <section className="work-panel delivery-panel">
        <div className="delivery-panel-head">
          <div>
            <p className="eyebrow">Pedidos en tiempo real</p>
            <h2>Pedidos activos</h2>
            <p className="muted">
              {datosAutoCompletos
                ? 'Actualiza el estado para que el cliente lo vea al instante en seguimiento.'
                : 'Los pedidos están visibles. Completa los datos del vehículo en tu perfil antes de tomar uno.'}
            </p>
          </div>
          <strong>{pedidosVisibles.length} pedido(s)</strong>
        </div>

        {pedidosVisibles.length === 0 ? (
          <p className="muted delivery-empty">No hay pedidos pendientes por ahora.</p>
        ) : (
          <div className="delivery-order-list">
            {pedidosVisibles.map((pedido) => {
              const indiceEstado = obtenerIndiceEstado(pedido.estado);
              const cliente = pedido.entrega || {};
              const nombreCliente = [
                cliente.nombre || pedido.nombre || pedido.nombres,
                cliente.apellido || pedido.apellido || pedido.apellidos,
              ].filter(Boolean).join(' ') || (typeof pedido.cliente === 'string' ? pedido.cliente : 'Cliente');
              const direccionCliente = cliente.direccion || pedido.direccion || pedido.domicilio || 'Dirección no registrada';
              const telefonoCliente = cliente.telefono || pedido.telefono || '-';
              const esPedidoEnCurso = normalizarEstado(pedido.estado) === 'en_camino' && pedido.repartidorId === repartidorId;

              return (
                <article className="delivery-order" key={pedido.id}>
                  <div className="delivery-order-main">
                    <span className="delivery-order-code">#{pedido.id.slice(0, 6).toUpperCase()}</span>
                    <h3>{nombreCliente}</h3>
                    <p>{direccionCliente}</p>
                    <small>{telefonoCliente} · {formatearFechaHora(pedido.creadoEn || pedido.createdAt || pedido.fecha)}</small>
                  </div>

                  <div className="delivery-products">
                    {(pedido.productos || []).map((producto) => (
                      <span key={`${pedido.id}-${producto.id}`}>
                        {producto.cantidad}x {producto.nombre}
                      </span>
                    ))}
                  </div>

                  <div className="delivery-state">
                    <span>{estadosPedido[indiceEstado]?.nombre || 'Recibido'}</span>
                    <strong>${Number(pedido.total || 0).toLocaleString('es-CL')}</strong>
                    {esPedidoEnCurso ? (
                      <>
                        <input
                          className="field delivery-code-field"
                          inputMode="numeric"
                          maxLength="4"
                          placeholder="Código final"
                          value={codigosFinales[pedido.id] || ''}
                          onChange={(evento) => setCodigosFinales({
                            ...codigosFinales,
                            [pedido.id]: evento.target.value.replace(/\D/g, '').slice(0, 4),
                          })}
                        />
                        <button
                          className="btn btn-primary"
                          disabled={actualizandoId === pedido.id}
                          onClick={() => completarPedido(pedido)}
                        >
                          Completar entrega
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-primary"
                        disabled={actualizandoId === pedido.id || Boolean(pedidoEnCurso) || !datosAutoCompletos}
                        onClick={() => tomarPedido(pedido)}
                      >
                        {datosAutoCompletos ? 'Tomar pedido' : 'Completa tu vehículo'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default Delivery;
