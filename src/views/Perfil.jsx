import React, { useEffect, useRef, useState } from 'react';
import { FiCamera, FiUpload } from 'react-icons/fi';
import { actualizarMiPerfil } from '../controllers/EmpleadoControl';
import { eliminarImagen, subirImagen } from '../controllers/ImagenControl';
import { useAuth } from '../controllers/AuthContext';
import '../styles/views/profile.css';

function Perfil({ notify, compact = false }) {
  const { usuario: sesion } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [progresoFoto, setProgresoFoto] = useState(null);
  const [form, setForm] = useState({ telefono: sesion?.telefono || '', email: sesion?.email || '' });
  const [fotoArchivo, setFotoArchivo] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(sesion?.fotoPerfilUrl || '');
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!fotoArchivo) return undefined;
    const url = URL.createObjectURL(fotoArchivo);
    setFotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [fotoArchivo]);

  useEffect(() => {
    if (!camaraAbierta) return undefined;
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [camaraAbierta]);

  if (!sesion) return null;

  const abrirEdicion = () => {
    setForm({ telefono: sesion.telefono || '', email: sesion.email || '' });
    setFotoArchivo(null);
    setFotoPreview(sesion.fotoPerfilUrl || '');
    setAbierto(true);
  };

  const cerrarEdicion = () => {
    setAbierto(false);
    setCamaraAbierta(false);
    setFotoArchivo(null);
    setFotoPreview(sesion.fotoPerfilUrl || '');
  };

  const abrirCamara = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify('Este navegador no permite usar la cámara. Puedes subir una foto desde tu dispositivo.', 'error');
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setCamaraAbierta(true);
    } catch (error) {
      console.error('No se pudo abrir la cámara:', error);
      notify('No se pudo acceder a la cámara. Revisa los permisos del navegador.', 'error');
    }
  };

  const tomarFoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) {
      notify('La cámara aún no está lista. Intenta nuevamente.', 'error');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        notify('No se pudo capturar la foto.', 'error');
        return;
      }
      setFotoArchivo(new File([blob], `perfil-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      setCamaraAbierta(false);
    }, 'image/jpeg', 0.9);
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return notify('Ingresa tu correo electrónico.', 'error');
    setGuardando(true);
    let nuevaFoto = null;
    try {
      if (fotoArchivo) {
        const idPerfil = sesion.perfilId || sesion.uid || sesion.rut || sesion.email;
        setProgresoFoto(0);
        nuevaFoto = await subirImagen('perfiles', idPerfil, fotoArchivo, setProgresoFoto);
      }

      const datosActualizados = await actualizarMiPerfil(sesion, {
        email: form.email.trim().toLowerCase(),
        telefono: form.telefono.trim(),
        fotoPerfilUrl: nuevaFoto?.imagenUrl ?? sesion.fotoPerfilUrl ?? '',
        fotoPerfilPath: nuevaFoto?.imagenPath ?? sesion.fotoPerfilPath ?? '',
      });

      if (nuevaFoto && sesion.fotoPerfilPath && sesion.fotoPerfilPath !== nuevaFoto.imagenPath) {
        await eliminarImagen(sesion.fotoPerfilPath);
      }
      const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
      localStorage.setItem('usuarios', JSON.stringify(usuarios.map((usuario) => (
        usuario.uid === sesion.uid || usuario.rut === sesion.rut ? { ...usuario, ...datosActualizados } : usuario
      ))));
      localStorage.setItem('sesion', JSON.stringify({ ...sesion, ...datosActualizados }));
      window.dispatchEvent(new Event('sesion-actualizada'));
      setAbierto(false);
      notify('Perfil actualizado.', 'success');
    } catch (error) {
      if (nuevaFoto?.imagenPath) await eliminarImagen(nuevaFoto.imagenPath);
      console.error('Error al actualizar perfil:', error);
      notify(error?.message || 'No se pudo actualizar el perfil.', 'error');
    } finally {
      setGuardando(false);
      setProgresoFoto(null);
    }
  };

  const nombre = [sesion.nombre || sesion.user, sesion.apellido].filter(Boolean).join(' ');
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase();

  return (
    <section data-tour="perfil" className={`profile-panel${compact ? ' profile-panel-compact' : ''}`}>
      <div className={`profile-summary${compact ? ' profile-summary-compact' : ''}`}>
        <button className="profile-avatar" type="button" onClick={abrirEdicion} aria-label="Editar foto de perfil">
          {sesion.fotoPerfilUrl ? <img src={sesion.fotoPerfilUrl} alt="Foto de perfil" /> : <span>{iniciales || 'U'}</span>}
          <span className="profile-avatar-camera"><FiCamera size={15} /></span>
        </button>
        {!compact && <>
          <span className="profile-summary-info"><strong>{nombre}</strong><small>{sesion.email || sesion.user}</small></span>
          <button className="btn btn-secondary" type="button" onClick={abrirEdicion}>Editar perfil</button>
        </>}
      </div>
      {abierto && (
        <div className="profile-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarEdicion(); }}>
          <form className="profile-modal" onSubmit={guardarPerfil} role="dialog" aria-modal="true" aria-labelledby="editar-perfil-titulo">
            <div className="modal-head"><h2 id="editar-perfil-titulo">Editar perfil</h2><button className="icon-btn" type="button" aria-label="Cerrar" onClick={cerrarEdicion}>×</button></div>
            <div className="profile-photo-editor">
              <div className="profile-avatar profile-avatar-large">
                {fotoPreview ? <img src={fotoPreview} alt="Vista previa del perfil" /> : <span>{iniciales || 'U'}</span>}
              </div>
              <div className="profile-photo-actions">
                <button className="btn btn-secondary" type="button" onClick={() => fileInputRef.current?.click()}><FiUpload /> Subir foto</button>
                <button className="btn btn-secondary" type="button" onClick={abrirCamara}><FiCamera /> Tomar foto</button>
                <input ref={fileInputRef} className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFotoArchivo(e.target.files?.[0] || null)} />
                <small>{progresoFoto === null ? 'JPG, PNG o WebP; máximo 5 MB.' : `Subiendo foto… ${progresoFoto}%`}</small>
              </div>
            </div>
            <label>Correo electrónico<input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Teléfono<input className="field" type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
            <div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={cerrarEdicion} disabled={guardando}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button></div>
          </form>
          {camaraAbierta && (
            <div className="profile-camera-backdrop">
              <section className="profile-camera-modal" role="dialog" aria-modal="true" aria-label="Tomar foto de perfil">
                <h2>Tomar foto</h2>
                <video ref={videoRef} autoPlay playsInline aria-label="Vista previa de la cámara" />
                <div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => setCamaraAbierta(false)}>Cancelar</button><button className="btn btn-primary" type="button" onClick={tomarFoto}>Usar esta foto</button></div>
              </section>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default Perfil;
