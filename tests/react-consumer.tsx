import {TextHueProvider, useAssignedColors, useTextColors} from '@texthue/react';

function Swatch() {
  const color = useTextColors('research');
  const collection = useAssignedColors(['research', 'design'] as const, {markers: true});
  return <span style={{color: color.light.fill.hex}}>{collection.markers?.research}</span>;
}

export const example = <TextHueProvider options={{seed: 42}}><Swatch /></TextHueProvider>;
// @ts-expect-error A numeric seed is required.
export const invalid = <TextHueProvider options={{seed: '42'}} />;
