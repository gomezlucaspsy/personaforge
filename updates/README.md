# updates/

Acá van los pedidos de cambios que te arman los agentes en su **My Computer**.
El archivo siempre se llama igual:

- `updates.txt`, o
- `updates.pdf`

Descargalo de My Computer con *Download* y subilo a esta carpeta (si ya existe,
reemplazalo). Al pushear a `main`, la Action `updates-to-pr.yml` compara con la
versión anterior, Claude implementa **solo lo nuevo** y abre un PR `[updates-bot]`
para que CodeRabbit lo revise y vos lo mergees.

Formato recomendado, un pedido concreto por línea:

```
[ ] Agregar botón para borrar todo el historial del chat
[ ] Mostrar la fecha en cada mensaje
```
