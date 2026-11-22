// Use the ESM-only package from CommonJS through dynamic import().
async function main() {
  const { resolveTextColors } = await import('texthue');
  const colors = await resolveTextColors('research');
  console.log(colors.light.fill.hex); // #59b8d8
}

main().catch(error => { console.error(error); process.exitCode = 1; });
