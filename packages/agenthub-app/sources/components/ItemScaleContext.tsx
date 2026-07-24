import * as React from 'react';

const defaultScaleFn = (base: number) => base;

const ItemScaleContext = React.createContext<(base: number) => number>(defaultScaleFn);

function createScaleFn(scale: number) {
    return (base: number) => Math.max(1, Math.round(base * scale));
}

export function ItemScaleProvider(props: { scale?: number; children: React.ReactNode }) {
    const scale = props.scale ?? 1;
    const scaleFn = React.useMemo(() => createScaleFn(scale), [scale]);
    return (
        <ItemScaleContext.Provider value={scaleFn}>
            {props.children}
        </ItemScaleContext.Provider>
    );
}

export function useItemScale() {
    return React.useContext(ItemScaleContext);
}
