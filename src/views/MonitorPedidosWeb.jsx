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

export function MonitorPedidosWebLegacy({ setMostrarMonitor }) {
  const [pedidos, setPedidos] = useState([]);
  const [clientesMap, setClientesMap] = useState({});
  const [filtro, setFiltro] = useState('todos');
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);

  const estados = ['Recibido', 'Preparando', 'Listo para retiro', 'En camino', 'Entregado'];

  // 1. Cargar colección 'clientes'
  useEffect(() => {
    const qClientes = query(collection(db, 'clientes'));
    const unsubscribeClientes = onSnapshot(qClientes, (snapshot) => {
      const mapa = {};
      snapshot.docs.forEach(doc => {
        mapa[doc.id] = doc.data();
      });
      setClientesMap(mapa);
    });

    return () => unsubscribeClientes();
  }, []);

  // 2. Cargar colección 'pedidos'
  useEffect(() => {
    const qPedidos = query(collection(db, 'pedidos'));
    const unsubscribePedidos = onSnapshot(qPedidos, (snapshot) => {
      const pedidosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPedidos(pedidosData);
    });

    return () => unsubscribePedidos();
  }, []);

  const actualizarEstado = async (idPedido, nuevoEstado) => {
    try {
      const pedidoRef = doc(db, 'pedidos', idPedido);
      await updateDoc(pedidoRef, { estado: nuevoEstado });
    } catch (error) {
      console.error("Error al actualizar el estado:", error);
    }
  };

  // Extrae el nombre buscando en 'entrega', en la colección 'clientes' o directamente
  const obtenerNombreCliente = (pedido) => {
    // 1. Buscar dentro del objeto 'entrega' (ej: entrega.nombre / entrega.apellido)
    if (pedido.entrega) {
      const nom = pedido.entrega.nombre || pedido.entrega.nombres || '';
      const ape = pedido.entrega.apellido || pedido.entrega.apellidos || '';
      if (nom || ape) return `${nom} ${ape}`.trim();
    }

    // 2. Buscar si clienteId coincide con la colección de 'clientes'
    const idRef = pedido.clienteId || pedido.uid || pedido.idUsuario;
    if (idRef && clientesMap[idRef]) {
      const datosCliente = clientesMap[idRef];
      return `${datosCliente.nombres || datosCliente.nombre || ''} ${datosCliente.apellidos || datosCliente.apellido || ''}`.trim();
    }

    // 3. Buscar si vienen directo en la raíz del documento
    if (pedido.nombres || pedido.nombre) {
      const nom = pedido.nombres || pedido.nombre || '';
      const ape = pedido.apellidos || pedido.apellido || '';
      return `${nom} ${ape}`.trim();
    }

    return 'Anónimo';
  };

  // Filtrado insensible a mayúsculas/minúsculas
  const pedidosFiltrados = filtro === 'todos'
    ? pedidos
    : pedidos.filter(p => (p.estado || 'recibido').toLowerCase().trim() === filtro.toLowerCase().trim());

  // Contador de pendientes (busca "recibido" sin importar mayúsculas)
  const cantidadPendientes = pedidos.filter(p => {
    const est = (p.estado || 'recibido').toLowerCase().trim();
    return !p.estado || est === 'recibido' || est === 'pendiente';
  }).length;

  return (
    <div style={{ padding: '10px' }}>
     
      {/* Encabezado */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Pedidos desde el Portal Web</h2>
       
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
          <button className="btn btn-danger" onClick={() => setMostrarMonitor(false)} style={{ margin: 0 }}>
            Volver a la Caja
          </button>
          <div style={{ backgroundColor: '#ffc107', color: '#000', padding: '5px 15px', borderRadius: '5px', fontWeight: 'bold' }}>
            Pedidos Pendientes: {cantidadPendientes}
          </div>
        </div>
      </header>

      {/* Filtros */}
      <nav style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => setFiltro('todos')}>Todos</button>
        <button className="btn btn-secondary" onClick={() => setFiltro('recibido')}>Recibidos</button>
        <button className="btn btn-secondary" onClick={() => setFiltro('preparando')}>Preparando</button>
        <button className="btn btn-secondary" onClick={() => setFiltro('en_camino')}>En camino</button>
        <button className="btn btn-secondary" onClick={() => setFiltro('entregado')}>Finalizados</button>
      </nav>

      {/* Grid de Pedidos */}
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
        {pedidosFiltrados.map(pedido => {
          // Normaliza la opción seleccionada con la lista de 'estados'
          const estadoNormalizado = estados.find(e => e.toLowerCase() === (pedido.estado || '').toLowerCase()) || 'Recibido';

          return (
            <div key={pedido.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
              <h3 style={{ marginTop: 0 }}>ID: {pedido.id.slice(-6).toUpperCase()}</h3>
             
              <p><strong>Cliente:</strong> {obtenerNombreCliente(pedido)}</p>
              <p><strong>Total:</strong> ${pedido.total || pedido.montoTotal || 0}</p>
              <p><strong>Estado:</strong> {pedido.estado || 'recibido'}</p>
             
              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <select
                  value={estadoNormalizado}
                  onChange={(e) => actualizarEstado(pedido.id, e.target.value)}
                  style={{ padding: '5px' }}
                >
                  {estados.map(est => (
                    <option key={est} value={est}>{est}</option>
                  ))}
                </select>
                <button className="btn btn-secondary" onClick={() => setPedidoSeleccionado(pedido)}>
                  Ver detalle
                </button>
              </div>
            </div>
          );
        })}

        {pedidosFiltrados.length === 0 && (
          <p style={{ gridColumn: '1 / -1' }}>Aún no hay pedidos registrados con el filtro seleccionado.</p>
        )}
      </main>

      {/* Modal / Sección de Detalle */}
      {pedidoSeleccionado && (
        <div style={{ marginTop: '20px', borderTop: '2px solid #eee', paddingTop: '20px' }}>
          <h3>Detalle del Pedido: {pedidoSeleccionado.id.slice(-6).toUpperCase()}</h3>
          <p><strong>Cliente:</strong> {obtenerNombreCliente(pedidoSeleccionado)}</p>
          {pedidoSeleccionado.entrega?.direccion && (
            <p><strong>Dirección:</strong> {pedidoSeleccionado.entrega.direccion}</p>
          )}
          {pedidoSeleccionado.entrega?.telefono && (
            <p><strong>Teléfono:</strong> {pedidoSeleccionado.entrega.telefono}</p>
          )}
         
          <h4>Productos:</h4>
          <ul>
            {pedidoSeleccionado.productos?.map((prod, index) => (
              <li key={index}>{prod.cantidad || 1}x {prod.nombre} - ${prod.precio}</li>
            ))}
          </ul>
          <button className="btn btn-secondary" onClick={() => setPedidoSeleccionado(null)} style={{ marginTop: '10px' }}>
            Cerrar detalle
          </button>
        </div>
      )}
    </div>
  );
}
