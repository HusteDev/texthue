// Use the ESM-only package from CommonJS through dynamic import().
async function main() {
  const { resolveTextColors } = await import('texthue');
  const colors = await resolveTextColors('research');
  console.log(colors.light.fill.hex); // #bf97fc
}

main().catch(error => { console.error(error); process.exitCode = 1; });
