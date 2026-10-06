export class EmpleadoModel {
  constructor({
    id                 = null,
    nombre             = '',
    apellido           = '',
    rut                = '',
    rol                = 'cajero',
    localAsignado      = {},
    turno              = 'dia',
    telefono           = '',
    email              = '',
    fechaIngreso       = null,
    activo             = true,
    restriccionHorario = true,
    sesionActiva       = false,
    ultimaConexion     = null,
    actualizadoEn      = null,
    // ← campos exclusivos de rol 'delivery'
    patente            = '',
    colorAuto          = '',
    marcaAuto          = '',
  }) {
    this.id                = id;
    this.nombre            = nombre.trim();
    this.apellido          = apellido.trim();
    this.rut               = rut.trim();
    this.rol               = rol;
    this.localAsignado     = (localAsignado && typeof localAsignado === 'object' && !Array.isArray(localAsignado))
      ? localAsignado
      : {};
    this.turno             = turno;
    this.telefono          = telefono.trim();
    this.email             = email.trim().toLowerCase();
    this.fechaIngreso      = fechaIngreso ?? new Date().toISOString().split('T')[0];
    this.activo            = activo;
    this.restriccionHorario = restriccionHorario;
    this.sesionActiva      = sesionActiva;
    this.ultimaConexion    = ultimaConexion ?? null;

    // Los campos de vehículo solo tienen sentido para 'delivery' (delivery);
    // se limpian para cualquier otro rol aunque vengan en el objeto de entrada.
    this.patente   = rol === 'delivery' ? patente.trim().toUpperCase() : '';
    this.colorAuto = rol === 'delivery' ? colorAuto.trim() : '';
    this.marcaAuto = rol === 'delivery' ? marcaAuto.trim() : '';

    this.actualizadoEn     = new Date().toISOString();
  }

  /**
   * @returns {boolean}
   */
  esDelivery() {
    return this.rol === 'delivery';
  }

  /**
   * @returns {string}
   */
  getNombreCompleto() {
    return [this.nombre, this.apellido].filter(Boolean).join(' ');
  }

  /**
   * @returns {string[]}
   */
  getLocalesAsignados() {
    return Object.entries(this.localAsignado)
      .filter(([, asignado]) => asignado === true)
      .map(([nombre]) => nombre);
  }

  toFirebase() {
    return {
      nombre:             this.nombre,
      apellido:           this.apellido,
      rut:                this.rut,
      rol:                this.rol,
      localAsignado:      this.localAsignado,
      turno:              this.turno,
      telefono:           this.telefono,
      email:              this.email,
      fechaIngreso:       this.fechaIngreso,
      activo:             this.activo,
      restriccionHorario: this.restriccionHorario,
      sesionActiva:       this.sesionActiva,
      ultimaConexion:     this.ultimaConexion,
      actualizadoEn:      this.actualizadoEn,
      patente:            this.patente,
      colorAuto:          this.colorAuto,
      marcaAuto:          this.marcaAuto,
    };
  }

  static fromFirebase(firebaseKey, data) {
    return new EmpleadoModel({
      id:                firebaseKey,
      nombre:            data.nombre             ?? '',
      apellido:          data.apellido           ?? '',
      rut:               data.rut                ?? '',
      rol:               data.rol                ?? 'cajero',
      localAsignado:     data.localAsignado       ?? {},
      turno:             data.turno               ?? 'dia',
      telefono:          data.telefono            ?? '',
      email:             data.email               ?? '',
      fechaIngreso:      data.fechaIngreso        ?? null,
      activo:            data.activo              ?? true,
      restriccionHorario: data.restriccionHorario ?? true,
      sesionActiva:      data.sesionActiva        ?? false,
      ultimaConexion:    data.ultimaConexion       ?? null,
      actualizadoEn:     data.actualizadoEn        ?? null,
      patente:           data.patente             ?? '',
      colorAuto:         data.colorAuto           ?? '',
      marcaAuto:         data.marcaAuto           ?? '',
    });
  }
}