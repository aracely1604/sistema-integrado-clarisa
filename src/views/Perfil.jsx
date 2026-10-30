import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { actualizarMiPerfil } from '../controllers/EmpleadoControl';
import { useAuth } from '../controllers/AuthContext';
import { db } from '../firebase';
import '../styles/views/profile.css';

function Perfil({ notify, compact = false }) {
  const { usuario: sesion } = useAuth();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [telefono, setTelefono] = useState(sesion?.telefono || '');
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    if (!sesion) return;
    let vigente = true;
    Promise.all(['ventas', 'autoconsumos'].map((nombreColeccion) => getDocs(collection(db, nombreColeccion))))
      .then((resultados) => {
        const nombreCuenta = [sesion.nombre || sesion.user, sesion.apellido].filter(Boolean).join(' ');
        const registrosUnicos = new Map(resultados.flatMap((resultado) => resultado.docs.map((item) => [item.id, { id: item.id, ...item.data() }])));
        const registros = [...registrosUnicos.values()]
          .filter((item) => [item.usuario, item.trabajadorId, item.uid].some((id) => String(id || '') === String(sesion.uid || sesion.rut)) || item.usuarioNombre === nombreCuenta || item.trabajadorNombre === nombreCuenta)
          .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
        if (vigente) setHistorial(registros);
      })
      .catch((error) => console.error('No se pudo cargar el historial del perfil:', error));
    return () => { vigente = false; };
  }, [sesion?.uid, sesion?.rut]);

  if (!sesion) return null;
  const nombre = [sesion.nombre || sesion.user, sesion.apellido].filter(Boolean).join(' ');
  const guardarTelefono = async (event) => {
    event.preventDefault();
    setGuardando(true);
    try {
      const datos = await actualizarMiPerfil(sesion, { telefono: telefono.trim() });
      localStorage.setItem('sesion', JSON.stringify({ ...sesion, ...datos }));
      window.dispatchEvent(new Event('sesion-actualizada'));
      setAbierto(false);
      notify('Teléfono actualizado.', 'success');
    } catch (error) {
      console.error('No se pudo actualizar el teléfono:', error);
      notify('No se pudo actualizar el teléfono.', 'error');
    } finally { setGuardando(false); }
  };

  if (compact) return <button className="btn btn-secondary" type="button" onClick={() => navigate('/perfil')}>Perfil</button>;
  return (
    <section data-tour="perfil" className="profile-panel">
      <div className="profile-summary">
        <span className="profile-summary-info"><strong>{nombre}</strong><small>{sesion.email || sesion.user}</small></span>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/portal')}>Volver al panel</button>
        <button className="btn btn-secondary" type="button" onClick={() => { setTelefono(sesion.telefono || ''); setAbierto(true); }}>Editar teléfono</button>
      </div>
      <div className="profile-details">
        <h2>Perfil</h2>
        <p><strong>RUT:</strong> {sesion.rut || '—'}</p><p><strong>Teléfono:</strong> {sesion.telefono || 'Sin registrar'}</p>
        <p><strong>Rol:</strong> {sesion.rol || '—'}{sesion.local ? ` · ${sesion.local}` : ''}</p>
        <details className="profile-history-details">
          <summary>Historial ({historial.length})</summary>
          {historial.length ? historial.map((registro) => <article className="profile-history-row" key={registro.id}><strong>{registro.tipo === 'autoconsumo' || registro.trabajadorId ? 'Autoconsumo' : 'Venta'} · ${Number(registro.total || 0).toLocaleString('es-CL')}</strong><small>{registro.localNombre || registro.local || 'Local'} · {new Date(registro.fecha || 0).toLocaleString('es-CL')}</small><span>{(registro.productos || []).map((producto) => `${producto.cantidad || 1}× ${producto.nombre}`).join(', ')}</span></article>) : <p className="muted">Aún no hay movimientos asociados a tu cuenta.</p>}
        </details>
      </div>
      {abierto && <div className="profile-modal-backdrop"><form className="profile-modal" onSubmit={guardarTelefono} role="dialog" aria-modal="true"><div className="modal-head"><h2>Editar perfil</h2><button className="icon-btn" type="button" onClick={() => setAbierto(false)}>×</button></div><label>Teléfono<input className="field" type="tel" value={telefono} onChange={(event) => setTelefono(event.target.value)} /></label><div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => setAbierto(false)}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button></div></form></div>}
    </section>
  );
}
export default Perfil;
