import {createStreamableValue, readStreamableValue} from 'ai/rsc';

export const runThread = async () => {
    'use server';

    const streamableStatus = createStreamableValue('thread.init');

    setTimeout(() => {
        streamableStatus.update('thread.run.create');
        streamableStatus.update('thread.run.update');
        streamableStatus.update('thread.run.end');
        streamableStatus.done('thread.end');
    }, 1000);

    return {
        status: streamableStatus.value,
    };
};
export default function Page() {
    return (
        <button
            onClick={async () => {
                const { status } = await runThread();

                for await (const value of readStreamableValue(status)) {
                    console.log(value);
                }
            }}
        >
            Ask
        </button>
    );
}