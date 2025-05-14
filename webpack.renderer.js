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
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader',
                    {
                        loader: 'postcss-loader',
                        options: {
                            postcssOptions: {
                                plugins: [
                                    require('@tailwindcss/postcss'),
                                ],
                            },
                        },
                    },
                ],
            }
        ],
    },
    resolve: {
        alias: {
            '@Pages': path.resolve(__dirname, 'src/renderer/pages'),
            '@Components': path.resolve(__dirname, 'src/renderer/components'),
            '@': path.resolve(__dirname, 'src/renderer'),
        },

        extensions: ['.tsx', '.ts', '.js', '.css'],
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
