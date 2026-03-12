#pragma once
#include "types.h"
#include <cmath>
#include <cstring>

class NeuralNet
{
public:
    // Layer buffers (pre-allocated)
    float inputBuf[INPUT_SIZE];
    float hidden1Buf[HIDDEN1_SIZE];
    float hidden2Buf[HIDDEN2_SIZE];
    float outputBuf[OUTPUT_SIZE];

    static float fastTanh(float x)
    {
        if (x < -3.0f)
            return -1.0f;
        if (x > 3.0f)
            return 1.0f;
        float x2 = x * x;
        return x * (27.0f + x2) / (27.0f + 9.0f * x2);
    }

    // Forward pass using agent's inline brainWeights
    void forward(const float *weights, const float *input)
    {
        // Copy input
        memcpy(inputBuf, input, INPUT_SIZE * sizeof(float));

        int wOff = 0;

        // Layer 1: INPUT -> HIDDEN1
        for (int j = 0; j < HIDDEN1_SIZE; j++)
        {
            float sum = 0.0f;
            for (int i = 0; i < INPUT_SIZE; i++)
            {
                sum += inputBuf[i] * weights[wOff + j * INPUT_SIZE + i];
            }
            sum += weights[wOff + INPUT_SIZE * HIDDEN1_SIZE + j]; // bias
            hidden1Buf[j] = fastTanh(sum);
        }
        wOff += INPUT_SIZE * HIDDEN1_SIZE + HIDDEN1_SIZE;

        // Layer 2: HIDDEN1 -> HIDDEN2
        for (int j = 0; j < HIDDEN2_SIZE; j++)
        {
            float sum = 0.0f;
            for (int i = 0; i < HIDDEN1_SIZE; i++)
            {
                sum += hidden1Buf[i] * weights[wOff + j * HIDDEN1_SIZE + i];
            }
            sum += weights[wOff + HIDDEN1_SIZE * HIDDEN2_SIZE + j]; // bias
            hidden2Buf[j] = fastTanh(sum);
        }
        wOff += HIDDEN1_SIZE * HIDDEN2_SIZE + HIDDEN2_SIZE;

        // Layer 3: HIDDEN2 -> OUTPUT (linear, then softmax)
        for (int j = 0; j < OUTPUT_SIZE; j++)
        {
            float sum = 0.0f;
            for (int i = 0; i < HIDDEN2_SIZE; i++)
            {
                sum += hidden2Buf[i] * weights[wOff + j * HIDDEN2_SIZE + i];
            }
            sum += weights[wOff + HIDDEN2_SIZE * OUTPUT_SIZE + j]; // bias
            outputBuf[j] = sum;
        }

        // Softmax
        softmax(outputBuf, OUTPUT_SIZE);
    }

    static void softmax(float *arr, int size)
    {
        float mx = arr[0];
        for (int i = 1; i < size; i++)
            if (arr[i] > mx)
                mx = arr[i];
        float sum = 0.0f;
        for (int i = 0; i < size; i++)
        {
            arr[i] = expf(arr[i] - mx);
            sum += arr[i];
        }
        if (sum > 0.0f)
        {
            float inv = 1.0f / sum;
            for (int i = 0; i < size; i++)
                arr[i] *= inv;
        }
    }

    static void initializeRandom(float *weights, SeededRandom &rng)
    {
        int sizes[] = {INPUT_SIZE, HIDDEN1_SIZE, HIDDEN2_SIZE, OUTPUT_SIZE};
        int offset = 0;
        for (int layer = 0; layer < 3; layer++)
        {
            int fanIn = sizes[layer];
            int fanOut = sizes[layer + 1];
            float scale = sqrtf(2.0f / (float)(fanIn + fanOut));
            for (int i = 0; i < fanIn * fanOut; i++)
            {
                weights[offset++] = (rng.next() * 2.0f - 1.0f) * scale;
            }
            for (int i = 0; i < fanOut; i++)
            {
                weights[offset++] = 0.0f;
            }
        }
    }

    static void mutate(const float *src, float *dst, int count,
                       float mutRate, float mutMag, SeededRandom &rng)
    {
        for (int i = 0; i < count; i++)
        {
            dst[i] = src[i];
            if (rng.next() < mutRate)
            {
                dst[i] += rng.nextGaussian() * mutMag;
                if (dst[i] < -5.0f)
                    dst[i] = -5.0f;
                if (dst[i] > 5.0f)
                    dst[i] = 5.0f;
            }
        }
    }

    static void crossover(const float *p1, const float *p2, float *child,
                          int count, SeededRandom &rng)
    {
        for (int i = 0; i < count; i++)
        {
            float r = rng.next();
            if (r < 0.45f)
                child[i] = p1[i];
            else if (r < 0.9f)
                child[i] = p2[i];
            else
                child[i] = (p1[i] + p2[i]) * 0.5f;
        }
    }
};
