import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import Perfil from './Perfil';
import { db } from '../firebase';
import { cerrarSesion } from '../models/authModel';
import '../styles/views/delivery.css';

const estadosPedido = [
  { id: 'recibido', nombre: 'Recibido' },
  { id: 'en_camino', nombre: 'En camino' },
  { id: 'entregado', nombre: 'Entregado' },
];

const obtenerIndiceEstado = (estado) => Math.max(0, estadosPedido.findIndex((item) => item.id === estado));

const formatearFechaHora = (valor) => {
  if (!valor) return '-';
  const fecha = typeof valor.toDate === 'function' ? valor.toDate() : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '-' : fecha.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
};

function Delivery({ navigate, notify }) {
  const [sesionActual, setSesionActual] = useState(() => JSON.parse(localStorage.getItem('sesion')));
  const [pedidos, setPedidos] = useState([]);
  const [actualizandoId, setActualizandoId] = useState('');
  const [codigosFinales, setCodigosFinales] = useState({});
  const sesion = sesionActual;

  useEffect(() => {
    const actualizarSesion = () => setSesionActual(JSON.parse(localStorage.getItem('sesion')));
    window.addEventListener('sesion-actualizada', actualizarSesion);
    return () => window.removeEventListener('sesion-actualizada', actualizarSesion);
  }, []);

  useEffect(() => {
    const consulta = query(collection(db, 'pedidos'), orderBy('creadoEn', 'desc'));
    const cancelarEscucha = onSnapshot(
      consulta,
      (resultado) => {
        const pedidosActualizados = resultado.docs
          .map((documento) => ({ id: documento.id, ...documento.data() }))
          .filter((pedido) => pedido.estado !== 'entregado');
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
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const datosAutoCompletos = Boolean(sesion.patente && sesion.colorAuto && sesion.marcaAuto);

  const repartidorId = sesion.uid || sesion.user;
  const pedidoEnCurso = pedidos.find((pedido) => pedido.estado === 'en_camino' && pedido.repartidorId === repartidorId);
  const pedidosVisibles = pedidoEnCurso
    ? [pedidoEnCurso]
    : pedidos.filter((pedido) => pedido.estado === 'recibido' || !pedido.repartidorId);

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
            <h2>{datosAutoCompletos ? 'Pedidos activos' : 'Completa los datos del vehículo'}</h2>
            <p className="muted">
              {datosAutoCompletos
                ? 'Actualiza el estado para que el cliente lo vea al instante en seguimiento.'
                : 'Ingresa patente, color del auto y marca en Editar perfil para comenzar.'}
            </p>
          </div>
          <strong>{pedidosVisibles.length} pedido(s)</strong>
        </div>

        {!datosAutoCompletos ? (
          <p className="muted delivery-empty">Completa tu perfil para tomar pedidos.</p>
        ) : pedidosVisibles.length === 0 ? (
          <p className="muted delivery-empty">No hay pedidos pendientes por ahora.</p>
        ) : (
          <div className="delivery-order-list">
            {pedidosVisibles.map((pedido) => {
              const indiceEstado = obtenerIndiceEstado(pedido.estado);
              const cliente = pedido.entrega || {};
              const esPedidoEnCurso = pedido.estado === 'en_camino' && pedido.repartidorId === repartidorId;

              return (
                <article className="delivery-order" key={pedido.id}>
                  <div className="delivery-order-main">
                    <span className="delivery-order-code">#{pedido.id.slice(0, 6).toUpperCase()}</span>
                    <h3>{cliente.nombre || 'Cliente'} {cliente.apellido || ''}</h3>
                    <p>{cliente.direccion || 'Dirección no registrada'}</p>
                    <small>{cliente.telefono || '-'} · {formatearFechaHora(pedido.creadoEn)}</small>
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
                        disabled={actualizandoId === pedido.id || Boolean(pedidoEnCurso)}
                        onClick={() => tomarPedido(pedido)}
                      >
                        Tomar pedido
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
