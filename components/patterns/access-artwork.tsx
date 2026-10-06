/** Decorative companion to the installation's account and status screens. */
export function AccessArtwork() {
  return (
    <div className="access-artwork" aria-hidden="true">
      <div className="access-artwork-label">
        Updates <span>·</span> Courses <span>·</span> Docs
      </div>
      <div className="access-artwork-pages">
        <div className="access-artwork-paper access-artwork-paper-back" />
        <div className="access-artwork-paper access-artwork-paper-middle" />
        <div className="access-artwork-paper access-artwork-paper-front">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
