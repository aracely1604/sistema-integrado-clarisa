import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import '../styles/views/monitor-pedidos-web.css';

const normalizar = (valor) => String(valor || '').trim().toLowerCase().replaceAll(' ', '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const modalidadPedido = (pedido) => {
  const valor = normalizar(pedido.modalidad || pedido.modalidadEntrega || pedido.tipoEntrega || pedido.entrega?.modalidad || pedido.entrega?.tipo || pedido.metodoEntrega);
  return valor.includes('retiro') || valor.includes('local') ? 'retiro' : 'delivery';
};
const estadoGrupo = (pedido) => {
  const estado = normalizar(pedido.estado || 'recibido');
  if (['entregado', 'finalizado', 'finalizada', 'completado', 'completada', 'retirado'].includes(estado)) return 'entregado';
  if (['preparando', 'en_preparacion', 'en_preparación'].includes(estado)) return 'preparando';
  if (['en_camino', 'listo', 'listo_despacho', 'listo_para_despacho', 'listo_para_retiro'].includes(estado)) return 'en_camino';
  if (estado.startsWith('recib') || estado.startsWith('pendient') || estado === 'nuevo') return 'recibido';
  return 'recibido';
};

export default function MonitorPedidosWeb({ setMostrarMonitor, notify = () => {} }) {
  const [pedidos, setPedidos] = useState([]);
  const [clientesMap, setClientesMap] = useState({});
  const [filtro, setFiltro] = useState('todos');
  const [modalidad, setModalidad] = useState('todas');
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState('');

  useEffect(() => {
    const cancelarClientes = onSnapshot(query(collection(db, 'clientes')), (snapshot) => {
      setClientesMap(Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()])));
    });
    const cancelarPedidos = onSnapshot(query(collection(db, 'pedidos')), (snapshot) => {
      setPedidos(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (error) => {
      console.error('No se pudieron cargar pedidos online:', error);
      notify('No se pudieron cargar los pedidos online.', 'error');
    });
    return () => { cancelarClientes(); cancelarPedidos(); };
  }, [notify]);

  const obtenerNombreCliente = (pedido) => {
    const cliente = pedido.entrega || {};
    const directo = [cliente.nombre || cliente.nombres || pedido.nombre || pedido.nombres, cliente.apellido || cliente.apellidos || pedido.apellido || pedido.apellidos].filter(Boolean).join(' ').trim();
    if (directo) return directo;
    const ref = pedido.clienteId || pedido.uid || pedido.idUsuario;
    const datos = clientesMap[ref];
    return datos ? [datos.nombre || datos.nombres, datos.apellido || datos.apellidos].filter(Boolean).join(' ') : (typeof pedido.cliente === 'string' ? pedido.cliente : 'Cliente');
  };

  const pedidosFiltrados = useMemo(() => pedidos.filter((pedido) => (
    (filtro === 'todos' || estadoGrupo(pedido) === filtro)
    && (modalidad === 'todas' || modalidadPedido(pedido) === modalidad)
  )).sort((a, b) => {
    const fecha = (valor) => valor?.toDate?.()?.getTime?.() || new Date(valor || 0).getTime() || 0;
    return fecha(b.creadoEn || b.createdAt || b.fecha) - fecha(a.creadoEn || a.createdAt || a.fecha);
  }), [pedidos, filtro, modalidad]);

  const cantidadPendientes = pedidos.filter((pedido) => ['recibido', 'pendiente'].includes(estadoGrupo(pedido))).length;
  const actualizarEstado = async (pedido, nuevoEstado) => {
    try {
      await updateDoc(doc(db, 'pedidos', pedido.id), { estado: nuevoEstado, actualizadoEn: serverTimestamp() });
      notify(`Pedido actualizado: ${nuevoEstado.replaceAll('_', ' ')}.`, 'success');
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      notify('No se pudo actualizar el estado del pedido.', 'error');
    }
  };

  const pestañas = [
    ['todos', 'Todos'], ['recibido', 'Pendientes'], ['preparando', 'Preparando'],
    ['en_camino', 'En camino'], ['entregado', 'Finalizados'],
  ];

  return (
    <section className="online-orders">
      <header className="online-orders-head">
        <div><p className="eyebrow">Pedidos web</p><h2>Gestión de pedidos</h2><p className="muted">Actualización en tiempo real · {cantidadPendientes} pendientes</p></div>
        <div className="online-orders-return">
          <button className="btn btn-secondary" onClick={() => setMostrarMonitor(false)}>Volver a la caja</button>
          <div className="online-pending-count" role="status" aria-live="polite">
            <strong>Pedidos Pendientes:</strong><span>{cantidadPendientes}</span>
          </div>
        </div>
      </header>
      <nav className="online-order-tabs" aria-label="Filtrar por estado">
        {pestañas.map(([id, label]) => <button key={id} type="button" className={filtro === id ? 'active' : ''} onClick={() => setFiltro(id)}>{label}<span>{id === 'todos' ? pedidos.length : pedidos.filter((p) => estadoGrupo(p) === id).length}</span></button>)}
      </nav>
      <div className="online-order-filters" role="group" aria-label="Modalidad de entrega">
        <strong>Entrega</strong>
        {[['todas', 'Todas'], ['retiro', 'Retiro en el local'], ['delivery', 'Delivery']].map(([id, label]) => <button key={id} className={modalidad === id ? 'active' : ''} onClick={() => setModalidad(id)}>{label}</button>)}
      </div>
      {pedidosFiltrados.length ? <div className="online-order-grid">
        {pedidosFiltrados.map((pedido) => {
          const grupo = estadoGrupo(pedido);
          const elegido = pedidoSeleccionado === pedido.id;
          const codigo = pedido.codigo || pedido.codigoPedido || pedido.id.slice(-6).toUpperCase();
          const productos = pedido.productos || pedido.items || [];
          const entrega = pedido.entrega || {};
          return <article className={`online-order-card ${elegido ? 'selected' : ''}`} key={pedido.id}>
            <div className="online-order-card-top"><span className="online-order-code">#{codigo}</span><span className={`online-order-status ${grupo === 'recibido' ? 'status-pendiente' : `status-${grupo}`}`}>{grupo === 'recibido' ? 'Pendiente' : pedido.estado || 'Pendiente'}</span></div>
            <h3>{obtenerNombreCliente(pedido)}</h3>
            <p className="online-order-meta">{modalidadPedido(pedido) === 'retiro' ? 'Retiro en el local' : 'Delivery'} · {productos.length} producto(s)</p>
            <strong className="online-order-total">${Number(pedido.total || pedido.montoTotal || 0).toLocaleString('es-CL')}</strong>
            <div className="online-order-actions">
              <button className="btn btn-secondary" onClick={() => setPedidoSeleccionado(elegido ? '' : pedido.id)}>{elegido ? 'Ocultar detalle' : 'Ver detalle'}</button>
              {grupo === 'recibido' && <button className="btn btn-primary" onClick={() => actualizarEstado(pedido, 'preparando')}>Preparar</button>}
              {grupo === 'preparando' && <button className="btn btn-primary" onClick={() => actualizarEstado(pedido, modalidadPedido(pedido) === 'retiro' ? 'listo_para_retiro' : 'listo_despacho')}>Marcar listo</button>}
            </div>
            {elegido && <section className="online-order-detail"><h4>Detalle del pedido</h4>
              <p><strong>Código:</strong> {codigo}</p><p><strong>Modalidad:</strong> {modalidadPedido(pedido) === 'retiro' ? 'Retiro en el local' : 'Delivery'}</p>
              {modalidadPedido(pedido) !== 'retiro' && <p><strong>Dirección:</strong> {entrega.direccion || pedido.direccion || pedido.domicilio || 'No registrada'}</p>}
              <p><strong>Teléfono:</strong> {entrega.telefono || pedido.telefono || 'No registrado'}</p>
              <h4>Productos</h4><ul>{productos.map((producto, index) => <li key={producto.id || `${producto.nombre}-${index}`}><span>{producto.cantidad || 1} × {producto.nombre || producto.producto}</span><strong>${Number(producto.precio || 0).toLocaleString('es-CL')}</strong></li>)}</ul>
              <p className="online-detail-total"><strong>Total</strong><strong>${Number(pedido.total || pedido.montoTotal || 0).toLocaleString('es-CL')}</strong></p>
            </section>}
          </article>;
        })}
      </div> : <div className="online-orders-empty"><strong>No hay pedidos para mostrar</strong><p>Prueba con otro estado o modalidad de entrega.</p></div>}
    </section>
  );
}
