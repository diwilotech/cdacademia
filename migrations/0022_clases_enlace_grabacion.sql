-- Clases virtuales: enlace de la clase (Zoom, Meet…) y enlace de la grabación. Provisional mientras no hay Zoom Pro: se pegan a mano.
ALTER TABLE ac_clases ADD COLUMN enlace TEXT;
ALTER TABLE ac_clases ADD COLUMN grabacion TEXT;
