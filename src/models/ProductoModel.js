// models/ProductoModel.js
//
// Nodo global de producto: datos base compartidos por los 3 locales
// (comida rápida, cafetería, almacén). Cada local maneja su propio stock,
// precio, proveedor Y estado activo/inactivo por separado (ver
// LocalProductoModel); este modelo solo contiene la info "maestra" del
// producto (nombre, categoría, código de barras, unidad de medida e imagen).
// La imagen vive en Firebase Storage; acá solo se guarda su URL y su ruta.
// No se asigna a ningún local automáticamente al crearlo acá.

export class ProductoModel {
  constructor({
    id            = null,
    nombre        = '',
    categoria     = '',
    codigoBarra   = '',
    unidadMedida  = 'unidad',   // 'unidad' | 'litros' | 'kilogramos'
    imagenUrl     = '',         // URL de descarga (Storage)
    imagenPath    = '',         // ruta en Storage (para reemplazar/borrar)
    creadoEn      = null,
    actualizadoEn = null,
  }) {
    this.id            = id;
    this.nombre         = nombre.trim();
    this.categoria      = categoria;
    this.codigoBarra    = codigoBarra.trim();
    this.unidadMedida   = unidadMedida;
    this.imagenUrl      = imagenUrl;
    this.imagenPath     = imagenPath;
    this.creadoEn       = creadoEn ?? new Date().toISOString();
    this.actualizadoEn  = new Date().toISOString();
  }

  toFirebase() {
    return {
      nombre:        this.nombre,
      categoria:     this.categoria,
      codigoBarra:   this.codigoBarra,
      unidadMedida:  this.unidadMedida,
      imagenUrl:     this.imagenUrl,
      imagenPath:    this.imagenPath,
      creadoEn:      this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }

  static fromFirebase(firebaseKey, data) {
    return new ProductoModel({
      id:            firebaseKey,
      nombre:        data.nombre        ?? '',
      categoria:     data.categoria     ?? '',
      codigoBarra:   data.codigoBarra   ?? '',
      unidadMedida:  data.unidadMedida  ?? 'unidad',
      imagenUrl:     data.imagenUrl     ?? '',
      imagenPath:    data.imagenPath    ?? '',
      creadoEn:      data.creadoEn      ?? null,
      actualizadoEn: data.actualizadoEn ?? null,
    });
  }
}