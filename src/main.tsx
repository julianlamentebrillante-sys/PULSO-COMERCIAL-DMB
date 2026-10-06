import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProveedorApp } from './app/contexto';
import { ProveedorAvisos } from './ui/componentes';
import './estilos.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorApp>
      <ProveedorAvisos>
        <App />
      </ProveedorAvisos>
    </ProveedorApp>
  </StrictMode>,
);
