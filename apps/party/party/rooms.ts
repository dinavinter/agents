import type * as Party from "partykit/server";
  
export interface Rooms {
  [key: string]: number;
}
export const SINGLETON_ROOM_ID = "index";

export default class OccupancyServer implements Party.Server {
  // Track room occupancy
  rooms: Rooms;

  constructor(public room: Party.Room) {
    this.rooms = {};
     
  }
  
  onStart() {

  


  }

  onConnect(connection: Party.Connection) {
    connection.send(JSON.stringify({ type: "rooms", rooms: this.rooms }));
     

  }

  async onRequest(req: Party.Request) {
    if (req.method === "GET") {
      return new Response( JSON.stringify({ 
            type: "rooms", 
            rooms: this.rooms,
            room: this.room.id,
             roomCount: this.rooms[this.room.id] || 0  
      }), { 
            headers: {
              "Access-Control-Allow-Origin": "*",
              'Content-Type': 'application/json',
            }
          }
          
      );
    }

    if (req.method === "POST") {
      const { room, count }: { room: string; count: number } = await req.json();
      this.rooms[room] = count;
      this.room.broadcast(JSON.stringify({ type: "rooms", rooms: this.rooms }));
      return Response.json({ ok: true });
    }

    // Always return a Response
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
}
