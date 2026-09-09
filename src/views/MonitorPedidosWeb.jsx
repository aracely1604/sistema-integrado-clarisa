import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function MonitorPedidosWeb({ setMostrarMonitor }) {
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