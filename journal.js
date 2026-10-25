const container = document.querySelector('#journal-posts');
fetch('posts.json').then(response => { if (!response.ok) throw Error('Unable to load'); return response.json(); }).then(posts => {
 container.replaceChildren();
 if (!posts.length) { const heading = document.createElement('h2'); heading.textContent = 'A little space for what comes next.'; const text = document.createElement('p'); text.textContent = 'Penny’s reflections will appear here as they are shared. Thank you for being part of this unfolding story.'; container.append(heading, text); }
 for (const post of posts) { const article = document.createElement('article'); article.className = 'journal-post'; const title = document.createElement('h2'); title.textContent = post.title; const date = document.createElement('p'); date.className = 'eyebrow'; date.textContent = post.date; article.append(date, title); for (const paragraph of post.body.split(/\n\s*\n/)) { const text = document.createElement('p'); text.textContent = paragraph; article.append(text); } container.append(article); }
}).catch(() => { container.textContent = 'The journal could not load. Please try again shortly.'; });
