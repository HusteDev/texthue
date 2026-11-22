'use client';

import {createContext, createElement, useContext, useMemo} from 'react';
import {createResolver} from 'texthue';

const ResolverContext = createContext(createResolver());

export function TextHueProvider({options, children}) {
  const resolver = useMemo(() => createResolver(options), [options]);
  return createElement(ResolverContext.Provider, {value:resolver}, children);
}

export function useTextColors(label) {
  const resolver = useContext(ResolverContext);
  return useMemo(() => resolver.resolve(label), [resolver, label]);
}

export function useAssignedColors(labels, settings) {
  const resolver = useContext(ResolverContext);
  return useMemo(() => resolver.assign(labels, settings), [resolver, labels, settings]);
}
