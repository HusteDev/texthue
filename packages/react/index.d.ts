import type {ReactElement, ReactNode} from 'react';
import type {Resolver, TextColorOptions} from 'texthue';

export function TextHueProvider(props: {options?: TextColorOptions; children?: ReactNode}): ReactElement;
export const useTextColors: Resolver['resolve'];
export const useAssignedColors: Resolver['assign'];
