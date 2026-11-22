import type {ReactElement, ReactNode} from 'react';
import type {createResolver, TextColorOptions} from 'texthue';

type Resolver = ReturnType<typeof createResolver>;

export function TextHueProvider(props: {options?: TextColorOptions; children?: ReactNode}): ReactElement;
export const useTextColors: Resolver['resolve'];
export const useAssignedColors: Resolver['assign'];
