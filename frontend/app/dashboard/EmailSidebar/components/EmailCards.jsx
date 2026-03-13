import React from "react";

const EmailCards = ({ msgs }) => {
  return (
    <div className="flex flex-col gap-2">
      {msgs.map((mail, index) => (
        <div
          key={mail.threadId || index}
          className="p-3 border rounded-md shadow-sm bg-gray-50
          animate-fadeInUp"
          style={{
            animationDelay: `${index * 70}ms`,
          }}
        >
          <p className="font-medium text-sm">{mail.subject}</p>

          <p className="text-xs text-gray-600">{mail.from}</p>

          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
            {mail.snippet}
          </p>
        </div>
      ))}
    </div>
  );
};

export default EmailCards;
