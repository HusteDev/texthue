use crate::Renderer;
use std::cell::Cell;

thread_local! {
    pub(super) static FITS: Cell<usize> = const { Cell::new(0) };
    pub(super) static CUSPS: Cell<usize> = const { Cell::new(0) };
    pub(super) static HASHES: Cell<usize> = const { Cell::new(0) };
}

#[test]
fn renderer_work_budgets() {
    for (target, light, fit_limit) in [
        (4.5, 255, 1600),
        (7.0, 255, 5732),
        (21.0, 255, 12725),
        (4.5, 119, 2868),
        (21.0, 119, 11452),
    ] {
        let options = Renderer {
            contrast_target: Some(target),
            light_background: [light; 3],
            ..Renderer::default()
        };
        let renderer = options.compile().unwrap();
        FITS.set(0);
        CUSPS.set(0);
        HASHES.set(0);
        for i in 0..100 {
            renderer.resolve(&format!("item:{i}")).unwrap();
        }
        let (fits, cusps, hashes) = (FITS.get(), CUSPS.get(), HASHES.get());
        println!("light={light} target={target} fits={fits} cusps={cusps} hashes={hashes}");
        assert!((1..=fit_limit).contains(&fits));
        assert!((1..=1600).contains(&cusps));
        assert_eq!(hashes, 100);
    }
}
