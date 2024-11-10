yarn config set yarn-offline-mirror ./npm-packages-offline-cache
yarn config set yarn-offline-mirror-pruning true 
cp ~/.yarnrc .
rm -rf node_modules/ yarn.lock # if they were previously generated
yarn install
