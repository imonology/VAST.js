/*
 * VAST, a scalable peer-to-peer network for virtual environments
 * Copyright (C) 2006 Shun-Yun Hu (syhu@yahoo.com)
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 */

package vast;

public class line2d
{
    public double  a,b,c;
    public int     bisectingID[] = new int[2];    // NOTE: we need to change this from storing node index to node id
    public int     vertexIndex[] = new int[2];
    public segment seg;
    
    public line2d (double x1, double y1, double x2 , double y2)
    {
        seg = new segment (x1, y1, x2, y2);
        
        if (y1 == y2) 
        {   
            a = 0; b = 1; c = y1;
        }
        else if (x1 == x2) 
        {
            a = 1; b = 0; c = x1;
        }
        else
        {
            double dx = x1 - x2; 
            double dy = y1 - y2;
            double m = dx / dy;
            a = -1 * m;
            b = 1;
            c = a*x1 + b*y1;
        }
    }

    public line2d () 
    {
        a = b = c = 0.0;
        seg = new segment (0, 0, 0, 0);
        
        vertexIndex[0] = -1;
        vertexIndex[1] = -1;
    }

    public line2d (double A, double B, double C)
    {
        a = A;
        b = B;
        c = C;
        seg = new segment (0, 0, 0, 0);
        
        vertexIndex[0] = -1;
        vertexIndex[1] = -1;
    }

    // BUG: possibily not storing p properly after calculation
    boolean intersection (line2d l, point2d p)
    {
        //The polynomial judgement
        double D = (a * l.b) - (b * l.a);
        if (D == 0) 
        {
            p.x = 0;
            p.y = 0;
            return false;
        }
        else
        {
            p.x=(c*l.b-b*l.c)/D/1.0;
            p.y=(a*l.c-c*l.a)/D/1.0;
            return true;
        }   
    }

    double dist (point2d p) 
    {        
        /*
        double u;

        // u = ((x3-x1)(x2-x1) + (y3-y1)(y2-y1)) / (p2.dist(p1)^2)
        u = ((p.x - seg.p1.x) * (seg.p2.x - seg.p1.x) + 
             (p.y - seg.p1.y) * (seg.p2.y - seg.p1.y)) /
             (seg.p1.dist (seg.p2))

        double x = seg.p1.x + u * (seg.p2.x - seg.p1.x);
        double y = seg.p1.y + u * (seg.p2.y - seg.p1.y);

        return p.dist (point2d (x, y));
        */

        return Math.abs (a * p.x + b * p.y + c) / Math.sqrt (Math.pow (a, 2) + Math.pow (b, 2));
    }
};

