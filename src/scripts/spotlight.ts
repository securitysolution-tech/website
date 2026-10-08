// Pointer spotlight on the service cards. Each card learns where the cursor is through two
// custom properties set through the CSSOM, which the style-src 'self' policy allows; no
// inline style attributes are written into markup.
if (matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll<HTMLElement>('[data-spotlight-root]').forEach((root) => {
    let raf = 0;
    let pending: PointerEvent | null = null;
    root.addEventListener(
      'pointermove',
      (e) => {
        pending = e;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const card = (pending!.target as HTMLElement).closest<HTMLElement>('[data-spotlight]');
          if (!card) return;
          const r = card.getBoundingClientRect();
          card.style.setProperty('--mx', `${pending!.clientX - r.left}px`);
          card.style.setProperty('--my', `${pending!.clientY - r.top}px`);
        });
      },
      { passive: true },
    );
  });
}
