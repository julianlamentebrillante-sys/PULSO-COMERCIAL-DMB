export function Marca({ grande }: { grande?: boolean }) {
  return (
    <span className={`marca ${grande ? 'marca--grande' : ''}`}>
      <svg className="marca__icono" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <path d="M4 17h6l3-8 5 14 3-6h7" fill="none" stroke="var(--color-acento)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span><strong>PULSO</strong> COMERCIAL <span className="marca__dmb">DMB</span></span>
    </span>
  );
}
