const NOMBRE_REGEX = /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+(?:\s[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+)*$/;

// Celular chileno: 9 dígitos en total, el primero siempre "9".
const TELEFONO_REGEX = /^9\d{8}$/;

export const DIAS_SEMANA_KEYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

export function validarNombreContacto(nombre) {
  return NOMBRE_REGEX.test((nombre ?? '').trim());
}

export function validarTelefono(telefono) {
  return TELEFONO_REGEX.test(limpiarTelefono(telefono));
}

export function limpiarTelefono(telefono) {
  return (telefono ?? '').toString().replace(/[\s-]/g, '').replace(/^(\+?56)/, '');
}

/** true si hay al menos un día de visita seleccionado. */
export function validarDias(dias) {
  return Array.isArray(dias) && dias.length > 0;
}

export function diasArrayToObjeto(dias = []) {
  const objeto = {};
  DIAS_SEMANA_KEYS.forEach((key, idx) => {
    objeto[key] = Array.isArray(dias) && dias.includes(idx);
  });
  return objeto;
}

export function diasObjetoToArray(diasObjeto) {
  if (Array.isArray(diasObjeto)) return diasObjeto; // dato viejo, ya viene como índices
  return DIAS_SEMANA_KEYS.reduce((acc, key, idx) => {
    if (diasObjeto?.[key]) acc.push(idx);
    return acc;
  }, []);
}

export function getInitials(nombre) {
  return (nombre ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase();
}

/**

 * @returns {object}
 */

export function validarDatosContacto({ nombre, telefono }) {
  const errores = {};

  if (!nombre || !nombre.trim()) {
    errores.nombre = 'El nombre es obligatorio';
  } else if (!validarNombreContacto(nombre)) {
    errores.nombre = 'El nombre no puede contener números ni caracteres especiales';
  }

  if (!telefono || !telefono.trim()) {
    errores.telefono = 'El teléfono es obligatorio';
  } else if (!validarTelefono(telefono)) {
    errores.telefono = 'Debe empezar en 9 y tener 9 dígitos en total (ej: 912345678)';
  }

  return errores;
}

export function validarProveedorGlobal({ nombre, empresa, telefono }) {
  const errores = validarDatosContacto({ nombre, telefono });
  if (!empresa || !empresa.trim()) {
    errores.empresa = 'La empresa es obligatoria';
  }
  return errores;
}

/**
 * @deprecated

 */
export function validarProveedor({ nombre, telefono, dias }) {
  const errores = validarDatosContacto({ nombre, telefono });

  if (!validarDias(dias)) {
    errores.dias = 'Selecciona al menos un día de visita';
  }

  return errores;
}

export class ProveedorModel {
  /**
   * @param {object} datos
   * @param {string} datos.id
   * @param {string} datos.nombre    
   * @param {string} datos.empresa   
   * @param {string} datos.telefono  
   * @param {number[]} datos.dias    
   *                                   
   * @param {string[]} datos.locales                          
   * @param {boolean} datos.activo   
   */
  constructor({
    id = '',
    nombre = '',
    empresa = '',
    telefono = '',
    dias = [],
    locales = [],
    activo = true,
  } = {}) {
    this.id = id;
    this.nombre = nombre;
    this.empresa = empresa;
    this.telefono = telefono;
    this.dias = dias;
    this.locales = locales;
    this.activo = activo;
  }

  /** Iniciales derivadas del nombre (compatibilidad con las tarjetas existentes). */
  get initials() {
    return getInitials(this.nombre);
  }

  /** Alias de empresa, usado por algunas tarjetas existentes como "tipo". */
  get tipo() {
    return this.empresa;
  }

  /** Datos propios del proveedor a persistir en proveedor/{id}. */
  toFirebaseProveedor() {
    return {
      nombre: this.nombre,
      empresa: this.empresa,
      telefono: this.telefono,
    };
  }

  /** Datos de la asignación a persistir en locales/{local}/proveedores/{id}. */
  toFirebaseAsignacion() {
    return {
      activo: this.activo,
      dias: diasArrayToObjeto(this.dias),
    };
  }

  /**
   * @param {string} local
   * @param {string} id
   * @param {object} datosProveedor   
   * @param {object} datosAsignacion
   * @returns {ProveedorModel}
   */
  static fromFirebase(local, id, datosProveedor = {}, datosAsignacion = {}) {
    return new ProveedorModel({
      id,
      nombre: datosProveedor?.nombre ?? '',
      empresa: datosProveedor?.empresa ?? '',
      telefono: datosProveedor?.telefono ?? '',
      dias: diasObjetoToArray(datosAsignacion?.dias),
      locales: [local],
      activo: datosAsignacion?.activo ?? true,
    });
  }
}