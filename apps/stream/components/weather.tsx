'use server';

import { createStreamableUI } from 'ai/rsc';
import React from 'react';
export const config = { runtime: 'edge' };

function getWeatherData():Promise<string>  {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve('Weather data loaded');
        }, 1000);
    });
}

function getForecastData():Promise<string> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve('Forecast data loaded');
        }, 2000);
    });
}

export async function getWeather() {
    const weatherUI = createStreamableUI();
    const forecastUI = createStreamableUI();

    weatherUI.update(<div>Loading weather...</div>);
    forecastUI.update(<div>Loading forecast...</div>);

    getWeatherData().then(weatherData => {
        weatherUI.done(<div>{weatherData}</div>);
    });

    getForecastData().then(forecastData => {
        forecastUI.done(<div>{forecastData}</div>);
    });

    // Return both streamable UIs and other data fields.
    return {
        requestedAt: Date.now(),
        weather: weatherUI.value,
        forecast: forecastUI.value,
    };
}

