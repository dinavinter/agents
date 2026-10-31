export default [{
    input: ['./index.js'],
    // external: id => /^(lib0|yjs|y-protocols|ws|lodash\.debounce|http|y-leveldb)/.test(id),
    output: [{
        dir: 'dist',
        format: 'cjs',
        sourcemap: true,
        entryFileNames: '[name].cjs',
        chunkFileNames: '[name]-[hash].cjs'
    }]
}
]