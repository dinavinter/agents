import { assign, emit, setup } from "xstate";
import { html } from "https://esm.sh/atomico";

// Gigya Account interface
interface GigyaAccount {
    UID: string;
    profile: {
        firstName?: string;
        lastName?: string;
        email?: string;
    };
    avatarUrl?: string;
}

// Custom component for displaying user avatars
export const UserAvatar = ({ account, swap }: { account: GigyaAccount; swap: string }) => {
    const name = account.profile.firstName || account.profile.email?.split('@')[0] || account.UID;
    return html`
        <div class="flex items-center space-x-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow" sse-swap="${swap}">
            <img class="w-12 h-12 rounded-full" src=${account.avatarUrl} alt=${name} />
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    ${name}
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 truncate">
                    ${account.profile.email || 'No email'}
                </p>
            </div>
            <div class="inline-flex items-center text-sm font-semibold text-gray-900 dark:text-white">
                ${account.profile.lastName || ''}
            </div>
        </div>
    `;
};

// Gigya Avatar Agent
export const gigyaAvatarAgent = setup({
    types: {
        events: {} as { type: 'FETCH_ACCOUNTS' | 'GENERATE_AVATAR' },
        context: {} as {
            accounts: GigyaAccount[];
            lastFetch: Date;
        }
    }
}).createMachine({
    id: 'gigyaAvatarAgent',
    initial: 'idle',
    context: {
        accounts: [],
        lastFetch: new Date()
    },
    entry: emit({
        data: `<div class="flex flex-col gap-4 p-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">User Avatars</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" hx-ext="sse" sse-swap="avatars" hx-swap="innerHTML"></div>
        </div>`,
        type: "content"
    }),
    states: {
        idle: {
            after: {
                1800000: 'fetchingAccounts'
            },
            entry: emit({
                data: 'Waiting for next update...',
                type: '@avatars.status'
            })
        },
        fetchingAccounts: {
            entry: emit({
                data: 'Fetching Gigya accounts...',
                type: '@avatars.status'
            }),
            invoke: {
                src: async () => {
                    // TODO: Replace with actual Gigya API call
                    const accounts: GigyaAccount[] = await fetch('/api/gigya/accounts')
                        .then(res => res.json());
                    return accounts;
                },
                onDone: {
                    target: 'generatingAvatars',
                    actions: [
                        assign({
                            accounts: (_, event) => event.data,
                            lastFetch: () => new Date()
                        }),
                        emit(({ context }) => ({
                            data: `Updated accounts at ${context.lastFetch.toLocaleTimeString()}`,
                            type: '@avatars.status'
                        }))
                    ]
                },
                onError: {
                    target: 'idle',
                    actions: emit({
                        data: 'Error fetching accounts',
                        type: '@avatars.status'
                    })
                }
            }
        },
        generatingAvatars: {
            invoke: {
                src: async (context) => {
                    const accountsWithoutAvatars = context.accounts.filter(acc => !acc.avatarUrl);
                    
                    for (const account of accountsWithoutAvatars) {
                        const seed = account.profile.firstName || 
                                   account.profile.email?.split('@')[0] || 
                                   account.UID;
                                   
                        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
                        
                        await fetch(`/api/gigya/accounts/${account.UID}/avatar`, {
                            method: 'PUT',
                            body: JSON.stringify({ avatarUrl })
                        });

                        // Emit each updated avatar
                        emit({
                            data: html`<${UserAvatar} account=${account} swap="@avatar.${account.UID}" />`.render(),
                            type: 'avatars'
                        });
                    }
                },
                onDone: {
                    target: 'idle',
                    actions: emit({
                        data: 'All avatars generated successfully',
                        type: '@avatars.status'
                    })
                },
                onError: {
                    target: 'idle',
                    actions: emit({
                        data: 'Error generating avatars',
                        type: '@avatars.status'
                    })
                }
            }
        }
    }
});
