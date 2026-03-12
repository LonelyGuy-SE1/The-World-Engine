#pragma once
#include "types.h"

class SpatialGrid
{
public:
    int width, height;
    int *cellHead; // size = width * height
    int *nextLink; // size = maxAgents
    int maxAgents;

    SpatialGrid() : width(0), height(0), cellHead(nullptr), nextLink(nullptr), maxAgents(0) {}

    SpatialGrid(int w, int h, int maxAg) : width(w), height(h), maxAgents(maxAg)
    {
        cellHead = new int[w * h];
        nextLink = new int[maxAg];
        clear();
    }

    void init(int w, int h, int maxAg)
    {
        width = w;
        height = h;
        maxAgents = maxAg;
        delete[] cellHead;
        delete[] nextLink;
        cellHead = new int[w * h];
        nextLink = new int[maxAg];
        clear();
    }

    ~SpatialGrid()
    {
        delete[] cellHead;
        delete[] nextLink;
    }

    void clear()
    {
        int sz = width * height;
        for (int i = 0; i < sz; i++)
            cellHead[i] = -1;
    }

    void rebuild(Agent *agents, int count, int /*worldWidth*/ = 0)
    {
        clear();
        if (count > maxAgents)
        {
            delete[] nextLink;
            maxAgents = count * 2;
            nextLink = new int[maxAgents];
        }
        for (int i = 0; i < count; i++)
        {
            if (!agents[i].alive)
                continue;
            int key = agents[i].y * width + agents[i].x;
            nextLink[i] = cellHead[key];
            cellHead[key] = i;
        }
    }

    int firstAt(int x, int y) const
    {
        if (x < 0 || x >= width || y < 0 || y >= height)
            return -1;
        return cellHead[y * width + x];
    }

    int next(int idx) const
    {
        return nextLink[idx];
    }

    // Disable copy
    SpatialGrid(const SpatialGrid &) = delete;
    SpatialGrid &operator=(const SpatialGrid &) = delete;
};
