// models/LocalProductoModel.js
//
// Producto DENTRO de un local puntual: locales/{local}/productos/{idProducto}.
// El idProducto es el mismo id del nodo global (ver models/ProductoModel.js) —
// acá solo vive la info operativa de ESE local: stock actual, stock mínimo,
// precio de venta y si está activo o no en este local específico.
//
// También guarda la oferta del producto en este local: `oferta` (precio de oferta,
// 0 = sin oferta definida) y `ofertaActiva` (si la oferta está vigente o no).
//
// `usoReceta` indica si el producto se usa como ingrediente de recetas en este local.
//
// El nombre, categoría, código de barras y unidad de medida del producto
// NO se repiten acá: se consultan desde el nodo global cuando se necesiten
// (ver controllers/ProductoControl.js).

export class LocalProductoModel {
  constructor({
    idProducto    = null,
    stockActual   = 0,
    stockMinimo   = 0,
    precioVenta   = 0,
    activo        = true,
    oferta        = 0,
    ofertaActiva  = false,
    usoReceta     = false,
    creadoEn      = null,
    actualizadoEn = null,
  } = {}) {
    this.idProducto    = idProducto;
    this.stockActual   = Number(stockActual) || 0;
    this.stockMinimo   = Number(stockMinimo) || 0;
    this.precioVenta   = Number(precioVenta) || 0;
    this.activo        = activo;
    this.oferta        = Number(oferta) || 0;
    this.ofertaActiva  = Boolean(ofertaActiva);
    this.usoReceta     = Boolean(usoReceta);
    this.creadoEn      = creadoEn ?? new Date().toISOString();
    this.actualizadoEn = new Date().toISOString();
  }

  toFirebase() {
    return {
      stockActual:   this.stockActual,
      stockMinimo:   this.stockMinimo,
      precioVenta:   this.precioVenta,
      activo:        this.activo,
      oferta:        this.oferta,
      ofertaActiva:  this.ofertaActiva,
      usoReceta:     this.usoReceta,
      creadoEn:      this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }

  static fromFirebase(idProducto, data = {}) {
    return new LocalProductoModel({
      idProducto,
      stockActual:   data.stockActual   ?? 0,
      stockMinimo:   data.stockMinimo   ?? 0,
      precioVenta:   data.precioVenta   ?? 0,
      activo:        data.activo        ?? true,
      oferta:        data.oferta        ?? 0,
      ofertaActiva:  data.ofertaActiva  ?? false,
      usoReceta:     data.usoReceta     ?? false,
      creadoEn:      data.creadoEn      ?? null,
      actualizadoEn: data.actualizadoEn ?? null,
    });
  }
}