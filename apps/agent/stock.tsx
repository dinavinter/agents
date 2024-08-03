'use server';

import {createStreamableUI} from "ai/rsc";
import {h} from "atomico"


function Spinner() {
    return <div>Loading...</div>;
}

function StockCard({ historyChart, price }) {
    return (
        <div>
            <div>Price: {price}</div>
            <div>{historyChart}</div>
        </div>
    );
}

function HistoryChart({ data }) {
    return <div>History chart</div>;
}

async function getStockPrice(param: { symbol: string }) {
    return 100;
}

export  function getStockHistoryChart({symbol}:{ symbol: string }) {
    'use server';

    const ui = createStreamableUI(<Spinner />);

    // We need to wrap this in an async IIFE to avoid blocking.
    (async () => {
        const price = await getStockPrice({ symbol });

        // Show a spinner as the history chart for now.
        const historyChart = createStreamableUI(<Spinner />);
        ui.done(<StockCard historyChart={historyChart.value} price={price} />);

        // Getting the history data and then update that part of the UI.
        const historyData = await fetch('https://my-stock-data-api.com');
        historyChart.done(<HistoryChart data={historyData} />);
    })();

    return ui;
}

export default function Stock() {
    return <div>Stock</div>;
}