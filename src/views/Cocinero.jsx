import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import Reloj from './Reloj';
import { db } from '../firebase';
import { useAuth } from '../controllers/AuthContext';
import { cerrarSesion } from '../models/authModel';
import TourGuiado from '../components/TourGuiado';
import '../styles/views/cocinero.css';

const normalizar = (estado) => String(estado || 'recibido').toLowerCase().trim().replaceAll(' ', '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Tour guiado del panel de cocina (HU-50). Los pasos cuyo elemento no exista se omiten
// (por ejemplo, el detalle de un pedido cuando no hay pedidos por preparar).
const PASOS_TOUR_COCINA = [
  { target: '[data-tour="coc-encabezado"]', content: 'Tu panel de preparación: aquí ves tu nombre y la hora actual, y puedes cerrar tu sesión.' },
  { target: '[data-tour="coc-pedidos"]', content: 'Pedidos online por preparar, del más reciente al más antiguo y actualizados en tiempo real. Si no hay ninguno, verás el aviso "No hay pedidos pendientes de preparación".' },
  { target: '[data-tour="coc-pedido"]', content: 'Cada tarjeta es un pedido: muestra su código, el nombre del cliente, su estado y los productos con sus cantidades.' },
  { target: '[data-tour="coc-acciones"]', content: '"Iniciar preparación" cambia el pedido a "preparando". Cuando termines, "Marcar listo" lo deja como listo.' },
];

export default function Cocinero({ notify }) {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [actualizando, setActualizando] = useState('');

  useEffect(() => onSnapshot(query(collection(db, 'pedidos')), (snapshot) => {
    setPedidos(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .filter((pedido) => [
        'recibido',
        'recibidos',
        'pendiente',
        'pendientes',
        'preparando',
        'en_preparacion',
      ].includes(normalizar(pedido.estado)))
      .sort((a, b) => (b.creadoEn?.toDate?.()?.getTime?.() || 0) - (a.creadoEn?.toDate?.()?.getTime?.() || 0)));
  }, (error) => { console.error(error); notify('No se pudieron cargar los pedidos de cocina.', 'error'); }), [notify]);

  const cambiarEstado = async (pedido, estado) => {
    setActualizando(pedido.id);
    try {
      await updateDoc(doc(db, 'pedidos', pedido.id), { estado, actualizadoEn: serverTimestamp() });
      notify(`Pedido actualizado: ${estado.replaceAll('_', ' ')}.`, 'success');
    } catch (error) {
      console.error(error); notify('No se pudo actualizar el pedido.', 'error');
    } finally { setActualizando(''); }
  };

  if (!usuario) return null;
  return <main className="dashboard-page">
    <header data-tour="coc-encabezado" className="dashboard-topbar"><div><p className="eyebrow">Cocinero: {usuario.nombre || usuario.user || usuario.email}</p><h1>Panel de preparación</h1><Reloj /></div><button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesión</button></header>
    <section data-tour="coc-pedidos" className="cook-order-grid">{pedidos.map((pedido) => {
      const estado = normalizar(pedido.estado);
      const productos = pedido.productos || pedido.items || [];
      const codigo = pedido.codigo || pedido.codigoPedido || pedido.id.slice(-6).toUpperCase();
      return <article data-tour="coc-pedido" className="work-panel cook-order-card" key={pedido.id}>
        <div className="cook-order-head"><div><span className="delivery-order-code">#{codigo}</span><h2>{pedido.nombre || pedido.entrega?.nombre || 'Pedido online'}</h2></div><span className="cook-state">{pedido.estado || 'Recibido'}</span></div>
        <ul>{productos.map((p, i) => <li key={p.id || `${p.nombre}-${i}`}><strong>{p.cantidad || 1}×</strong> {p.nombre || p.producto}</li>)}</ul>
        <div data-tour="coc-acciones" className="cook-order-actions">{estado === 'recibido' || estado === 'pendiente' ? <button className="btn btn-primary" disabled={actualizando === pedido.id} onClick={() => cambiarEstado(pedido, 'preparando')}>Iniciar preparación</button> : null}{['preparando', 'en_preparacion'].includes(estado) && <button className="btn btn-primary" disabled={actualizando === pedido.id} onClick={() => cambiarEstado(pedido, 'listo')}>Marcar listo</button>}</div>
      </article>;
    })}{pedidos.length === 0 && <p className="muted">No hay pedidos pendientes de preparación.</p>}</section>
    <TourGuiado steps={PASOS_TOUR_COCINA} />
  </main>;
}
