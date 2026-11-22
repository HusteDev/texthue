use criterion::{criterion_group, criterion_main, Criterion, Throughput};
use std::hint::black_box;
use texthue::Renderer;

fn render(c: &mut Criterion) {
    let mut singles = c.benchmark_group("resolve");
    for (name, target, background) in [
        ("default", 4.5, [255; 3]),
        ("aaa", 7.0, [255; 3]),
        ("maximum", 21.0, [255; 3]),
        ("gray", 4.5, [119; 3]),
        ("unattainable_on_gray", 21.0, [119; 3]),
    ] {
        let options = Renderer {
            contrast_target: Some(target),
            light_background: background,
            ..Renderer::default()
        };
        let renderer = options.compile().unwrap();
        singles.bench_function(name, |b| {
            b.iter(|| renderer.resolve(black_box("project:atlas")).unwrap())
        });
    }
    singles.finish();

    let options = Renderer::default();
    let renderer = options.compile().unwrap();
    let mut batches = c.benchmark_group("batch");
    batches.throughput(Throughput::Elements(40));
    for (name, distinct) in [("40_unique", 40), ("40_with_8_unique", 8)] {
        let labels: Vec<_> = (0..40).map(|i| format!("item:{}", i % distinct)).collect();
        batches.bench_function(name, |b| {
            b.iter(|| renderer.batch(black_box(&labels)).unwrap())
        });
    }
    batches.finish();
}

criterion_group!(benches, render);
criterion_main!(benches);
