import { useEffect, useRef } from "react";

// Multi-step forms: when `step` changes, jump to the top of the page (or of
// `targetRef` if given). Runs after the new step has rendered, and again a
// moment later, so late layout changes (editors, images) can't leave the
// page part-way down or in the footer. Skips the first render.
export function useScrollTopOnStep(step, targetRef) {
    const first = useRef(true);
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return undefined;
        }
        const toTop = () => {
            window.scrollTo(0, 0);
            if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            targetRef?.current?.scrollIntoView?.({ block: "start" });
        };
        toTop();
        const raf = requestAnimationFrame(toTop);
        const t1 = setTimeout(toTop, 120);
        const t2 = setTimeout(toTop, 400);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(t1);
            clearTimeout(t2);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);
}

export default useScrollTopOnStep;
