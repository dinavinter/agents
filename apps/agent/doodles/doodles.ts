import  images from './log/images.json'
import fs from "node:fs";
const doodles = Object.values(images).map(({repo, path, branch, analysis}) => {
    return {
        src: `https://raw.githubusercontent.com/${repo}/${branch}/${path.replaceAll('png', 'svg')}` ,
        alt: analysis
    }
})
fs.writeFileSync('doodles.json', JSON.stringify(doodles, null, 2))