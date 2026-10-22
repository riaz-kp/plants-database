import { useEffect, type DependencyList, type RefObject } from 'react';

/**
 * Keeps a table's <thead> in view while the page scrolls past the table.
 *
 * `position: sticky` can't do this when the table sits inside a horizontal
 * scroll container (that container becomes the sticky scrollport), so the
 * header is shifted down by however far the table top has scrolled above
 * `getTop()` — a viewport y-coordinate, e.g. the bottom of a floating toolbar.
 * The shift is exposed as `data-floating` on the <thead> for styling.
 */
export function useFloatingTableHeader(
    tableRef: RefObject<HTMLTableElement | null>,
    getTop: () => number,
    deps: DependencyList,
) {
    useEffect(() => {
        const table = tableRef.current;
        const thead = table?.tHead;
        if (!table || !thead) return;
        const scroller: HTMLElement | Window = table.closest('main') ?? window;

        const update = () => {
            const rect = table.getBoundingClientRect();
            const maxShift = Math.max(0, rect.height - thead.offsetHeight);
            const shift = Math.min(Math.max(getTop() - rect.top, 0), maxShift);
            thead.style.transform = shift ? `translateY(${shift}px)` : '';
            thead.toggleAttribute('data-floating', shift > 0);
        };

        scroller.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        update();
        return () => {
            scroller.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            thead.style.transform = '';
            thead.removeAttribute('data-floating');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
