function Fact({ label, value }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

export default Fact;
