import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../controllers/AuthContext';
import { db } from '../firebase';
import '../css/CredencialVirtual.css';

const fechaHoy = () => new Date().toISOString().slice(0, 10);

const leerFirmas = () => {
  try {
    return JSON.parse(localStorage.getItem('firmasAutoconsumo')) || [];
  } catch {
    return [];
  }
};

function CredencialVirtual() {
  const { usuario } = useAuth();
  const [visible, setVisible] = useState(false);
  const [firmaHoy, setFirmaHoy] = useState(null);

  useEffect(() => {
    if (!usuario) {
      setFirmaHoy(null);
      return undefined;
    }
    let activo = true;
    const actualizarEstadoFirma = async () => {
      const firmaLocal = leerFirmas().find((item) => (
        String(item.fecha || item.firmadaEn || '').slice(0, 10) === fechaHoy()
        && (item.trabajadorId === usuario.uid || item.trabajadorId === usuario.rut)
      ));
      if (activo) setFirmaHoy(firmaLocal || null);

      try {
        const identificadores = [usuario.uid, usuario.rut].filter(Boolean);
        const consultas = await Promise.all(identificadores.map((id) => getDocs(query(
          collection(db, 'firmasAutoconsumo'), where('trabajadorId', '==', id),
        ))));
        const firmaRemota = consultas.flatMap((resultado) => resultado.docs.map((documento) => documento.data()))
          .find((item) => String(item.fecha || item.firmadaEn || '').slice(0, 10) === fechaHoy());
        if (activo && firmaRemota) setFirmaHoy(firmaRemota);
      } catch (error) {
        // El estado local mantiene la credencial operativa si no hay conexión.
        console.warn('No se pudo consultar el estado de firma:', error);
      }
    };

    actualizarEstadoFirma();
    window.addEventListener('autoconsumos-actualizados', actualizarEstadoFirma);
    window.addEventListener('storage', actualizarEstadoFirma);
    return () => {
      activo = false;
      window.removeEventListener('autoconsumos-actualizados', actualizarEstadoFirma);
      window.removeEventListener('storage', actualizarEstadoFirma);
    };
  }, [usuario?.uid, usuario?.rut]);

  if (!usuario) return null;

  const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.email || 'Trabajador/a';
  const rut = usuario.rut || 'Sin RUT registrado';

  return (
    <>
      <section className="credential-access" aria-label="Acceso a credencial virtual">
        <div><p className="eyebrow">Credencial virtual</p><span>Tu RUT es tu credencial para identificar los autoconsumos.</span></div>
        <button className="btn btn-secondary" onClick={() => setVisible(true)}>Ver credencial</button>
      </section>
      {visible && (
        <div className="modal-backdrop">
          <section className="modal-card credential-modal" role="dialog" aria-modal="true" aria-label="Credencial virtual">
            <div className="modal-head"><h2>Mi credencial virtual</h2><button className="icon-btn" onClick={() => setVisible(false)}>×</button></div>
            <div className="virtual-credential">
              <div>
                <p className="eyebrow">Trabajador/a activo/a</p>
                <strong>{nombre}</strong>
                <span>{usuario.rol || 'trabajador'} · RUT: {rut}</span>
                <span className={firmaHoy ? 'credential-signature signed' : 'credential-signature pending'}>
                  {firmaHoy ? `✓ Firmado hoy${firmaHoy.firmadaEn ? ` · ${new Date(firmaHoy.firmadaEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}` : '○ Firma pendiente hoy'}
                </span>
              </div>
              <div className="credential-code" title="Credencial virtual identificada por RUT"><b>RUT</b><small>{rut}</small></div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default CredencialVirtual;
