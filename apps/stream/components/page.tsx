'use client';
import React from 'react';

import { useState } from 'react';
import { getStockHistoryChart } from './stock';
import {useSyncUIState} from "ai/rsc";

export default function Page() {
    const [component, setComponent] = useState<React.ReactNode>();
    useSyncUIState()
    return (
        <div>
            <form
                onSubmit={async e => {
                    e.preventDefault();
                    setComponent(await getStockHistoryChart({symbol:"sd"}).then(ui => ui.value));
                }}
            >
                <button>Stream Component</button>
            </form>
            {component}
            {/*{getStockHistoryChart({symbol: 'AAPL'})*/}
        </div>
    );
}