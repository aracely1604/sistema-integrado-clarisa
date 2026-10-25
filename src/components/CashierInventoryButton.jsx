import { useNavigate } from 'react-router-dom';
import { useAuth } from '../controllers/AuthContext';

export default function CashierInventoryButton() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const rol = String(usuario?.rol || '').trim().toLowerCase();
  if (rol !== 'cajero' && !rol.startsWith('cajero_')) return null;

  return (
    <button className="btn btn-secondary" type="button" onClick={() => navigate('/alertas')}>
      Inventario
    </button>
  );
}
