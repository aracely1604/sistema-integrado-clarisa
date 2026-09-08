// models/HistorialStockModel.js
//
// Movimiento de stock: historialStock/{idMovimiento}. Es la trazabilidad de
// TODO cambio de stockActual de un producto dentro de un local — NO
// reemplaza stockActual (esa sigue siendo la "foto" del momento), esto
// responde "qué movimientos hicieron que llegara a este stock".
//
// Los campos que no aplican a un tipo de movimiento quedan en null, mismo
// criterio que ya usan ProductoModel/LocalProductoModel con `??`.

export const TIPOS_MOVIMIENTO_STOCK = ['reposicion', 'transferencia', 'devolucion'];

export class HistorialStockModel {
  constructor({
    id               = null,
    fecha            = null,   // serverTimestamp() al crear
    local            = '',
    idProducto       = '',
    tipoMovimiento   = 'reposicion',
    cantidad         = 0,
    stockAnterior    = 0,
    stockNuevo       = 0,
    usuario          = null,   // uid del usuario autenticado
    idProveedor      = null,   // solo reposición
    localRelacionado = null,   // solo transferencia (el "otro" local)
    valorUnitario    = null,   // reposición y transferencia
    valorTotal       = null,   // = cantidad * valorUnitario
    fechaVencimiento = null,   // solo reposición
  } = {}) {
    this.id               = id;
    this.fecha             = fecha;
    this.local             = local;
    this.idProducto        = idProducto;
    this.tipoMovimiento    = tipoMovimiento;
    this.cantidad          = Number(cantidad) || 0;
    this.stockAnterior     = Number(stockAnterior) || 0;
    this.stockNuevo        = Number(stockNuevo) || 0;
    this.usuario           = usuario ?? null;
    this.idProveedor       = idProveedor ?? null;
    this.localRelacionado  = localRelacionado ?? null;
    this.valorUnitario     = esVacio(valorUnitario) ? null : Number(valorUnitario);
    this.valorTotal        = esVacio(valorTotal) ? null : Number(valorTotal);
    this.fechaVencimiento  = fechaVencimiento ?? null;
  }

  toFirebase() {
    return {
      fecha:            this.fecha,
      local:            this.local,
      idProducto:       this.idProducto,
      tipoMovimiento:   this.tipoMovimiento,
      cantidad:         this.cantidad,
      stockAnterior:    this.stockAnterior,
      stockNuevo:       this.stockNuevo,
      usuario:          this.usuario,
      idProveedor:      this.idProveedor,
      localRelacionado: this.localRelacionado,
      valorUnitario:    this.valorUnitario,
      valorTotal:       this.valorTotal,
      fechaVencimiento: this.fechaVencimiento,
    };
  }

  static fromFirebase(id, data = {}) {
    return new HistorialStockModel({
      id,
      fecha:            data.fecha            ?? null,
      local:            data.local            ?? '',
      idProducto:       data.idProducto       ?? '',
      tipoMovimiento:   data.tipoMovimiento   ?? 'reposicion',
      cantidad:         data.cantidad         ?? 0,
      stockAnterior:    data.stockAnterior    ?? 0,
      stockNuevo:       data.stockNuevo       ?? 0,
      usuario:          data.usuario          ?? null,
      idProveedor:      data.idProveedor      ?? null,
      localRelacionado: data.localRelacionado ?? null,
      valorUnitario:    data.valorUnitario    ?? null,
      valorTotal:       data.valorTotal       ?? null,
      fechaVencimiento: data.fechaVencimiento ?? null,
    });
  }
}

function esVacio(valor) {
  return valor === null || valor === undefined || valor === '';
}