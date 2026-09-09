import React, { useState } from 'react';
import { useAuth } from '../controllers/AuthContext';
import '../css/CredencialVirtual.css';

const codigoCredencial = (usuario) => String(usuario?.uid || usuario?.rut || usuario?.email || 'TRABAJADOR')
  .replace(/[^a-zA-Z0-9]/g, '')
  .slice(-12)
  .toUpperCase();

function CredencialVirtual() {
  const { usuario } = useAuth();
  const [visible, setVisible] = useState(false);
  if (!usuario) return null;

  const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.email || 'Trabajador/a';
  const codigo = codigoCredencial(usuario);

  return (
    <>
      <section className="credential-access" aria-label="Acceso a credencial virtual">
        <div><p className="eyebrow">Credencial virtual</p><span>Usa tu credencial para identificar tus autoconsumos.</span></div>
        <button className="btn btn-secondary" onClick={() => setVisible(true)}>Ver credencial</button>
      </section>
      {visible && (
        <div className="modal-backdrop">
          <section className="modal-card credential-modal" role="dialog" aria-modal="true" aria-label="Credencial virtual">
            <div className="modal-head"><h2>Mi credencial virtual</h2><button className="icon-btn" onClick={() => setVisible(false)}>×</button></div>
            <div className="virtual-credential">
              <div><p className="eyebrow">Trabajador/a activo/a</p><strong>{nombre}</strong><span>{usuario.rol || 'trabajador'} · {usuario.rut || usuario.email || 'Sin identificación registrada'}</span></div>
              <div className="credential-code" title="Código de credencial virtual"><b>CV</b><small>{codigo || 'ACTIVA'}</small></div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default CredencialVirtual;
