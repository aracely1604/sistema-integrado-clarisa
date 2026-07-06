import React, { useEffect, useState } from 'react';

function Reloj() {
  const [ahora, setAhora] = useState(new Date());

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <p className="datetime-line">
      {ahora.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium' })}
    </p>
  );
}

export default Reloj;
