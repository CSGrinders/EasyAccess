const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');
const env = dotenv.config().parsed;

module.exports = {
    entry: './src/renderer/index.tsx',
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
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
            '@Types': path.resolve(__dirname, 'src/types'),
            '@': path.resolve(__dirname, 'src/renderer'),
        },
        fallback: {
            "buffer": require.resolve("buffer")
        },
        extensions: ['.tsx', '.ts', '.js', '.css'],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'renderer.js',
    },
    plugins: [
        new HtmlWebpackPlugin({template: './public/index.html'}),
        new webpack.DefinePlugin({
            'process.env': JSON.stringify(env),
        }),
    ],
    devServer: {
        port: 3000,
        hot: true,
    },
};
