const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './src/renderer/index.tsx',
    mode: 'development',
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/i,
                include: path.resolve(__dirname, 'src'),
                use: ['style-loader', 'css-loader', 'postcss-loader'],
            },
        ],
    },
    resolve: {
        alias: {
            '@Pages': path.resolve(__dirname, 'src/renderer/pages'),
            '@Components': path.resolve(__dirname, 'src/renderer/components'),
            '@': path.resolve(__dirname, 'src/renderer'),
        },
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'renderer.js',
    },
    plugins: [
        new HtmlWebpackPlugin({template: './public/index.html'}),
    ],
    devServer: {
        port: 3000,
        hot: true,
    },
};
