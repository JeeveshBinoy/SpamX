import React from 'react';

export default function ShapHtml({ htmlString }) {
    if (!htmlString) return null;

    // We use dangerouslySetInnerHTML to render the exact HTML block that the HF space naturally generates, retaining all inline styles.
    return (
        <div className="w-full pt-2">
            <div 
                className="prose prose-invert max-w-none prose-p:my-2 prose-h2:text-xl w-full [&>div]:w-full"
                dangerouslySetInnerHTML={{ __html: htmlString }}
            />
        </div>
    );
}
