use criterion::{criterion_group, criterion_main, Criterion, Throughput};
use std::hint::black_box;
use std::time::Instant;
use texthue::{ContrastModel, Renderer};

fn render(c: &mut Criterion) {
    let mut singles = c.benchmark_group("resolve");
    for (name, target, background) in [
        ("default", 4.5, [255; 3]),
        ("aaa", 7.0, [255; 3]),
        ("maximum", 21.0, [255; 3]),
        ("gray", 4.5, [119; 3]),
        ("unattainable_on_gray", 21.0, [119; 3]),
        ("apca", 75.0, [255; 3]),
    ] {
        let options = Renderer {
            contrast_model: if name == "apca" {
                ContrastModel::Apca
            } else {
                ContrastModel::Wcag2
            },
            contrast_target: Some(target),
            light_background: background,
            ..Renderer::default()
        };
        let renderer = options.compile().unwrap();
        // Match the JS/Python corpus. Keep each allocation and result drop outside the timer.
        let mut samples = Vec::with_capacity(100);
        for index in -20..100 {
            let label = format!("item:{index}");
            let start = Instant::now();
            let result = renderer.resolve(black_box(&label)).unwrap();
            let micros = start.elapsed().as_secs_f64() * 1e6;
            black_box(result);
            if index >= 0 {
                samples.push(micros);
            }
        }
        samples.sort_unstable_by(f64::total_cmp);
        println!(
            "corpus/{name} median-us={:.2} p95-us={:.2}",
            (samples[49] + samples[50]) / 2.0,
            samples[94]
        );
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

    let labels: Vec<_> = (0..40).map(|i| format!("item:{i}")).collect();
    let pins = Default::default();
    let mut samples = Vec::with_capacity(20);
    for i in -5..20 {
        let start = Instant::now();
        let assignment = renderer.assign(&labels, &pins).unwrap();
        let micros = start.elapsed().as_secs_f64() * 1e6;
        assert_eq!(assignment.colors.len(), labels.len());
        if i >= 0 {
            samples.push(micros);
        }
    }
    samples.sort_unstable_by(f64::total_cmp);
    println!(
        "corpus/assign40 median-us={:.2} p95-us={:.2}",
        (samples[9] + samples[10]) / 2.0,
        samples[18]
    );
    c.bench_function("assign40", |b| {
        b.iter(|| renderer.assign(black_box(&labels), &pins).unwrap())
    });
}

criterion_group!(benches, render);
criterion_main!(benches);
